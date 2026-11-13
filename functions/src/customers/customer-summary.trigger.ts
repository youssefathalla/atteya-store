import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import {
  accountFieldsChanged,
  buildCustomerSummary,
  CUSTOMERS_COLLECTION,
  customerAccountFrom,
  customerEmailOf,
  customerIdFromEmail,
  customerOrderFrom,
  emailLookupValues,
  CUSTOMER_ORDER_FIELDS,
  MAX_CUSTOMER_ORDERS,
  orderFieldsChanged,
  normalizeCustomerEmail,
  type CustomerSummary,
} from './customer-summary.js';

const TRIGGER_OPTIONS = { region: 'europe-west3', retry: true } as const;

const toMs = (value: unknown): number | null => (value instanceof Timestamp ? value.toMillis() : null);
const toTimestamp = (ms: number | null): Timestamp | null => (ms === null ? null : Timestamp.fromMillis(ms));

async function authUserByEmail(email: string): Promise<UserRecord | null> {
  try {
    return await getAuth().getUserByEmail(email);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    // No account, or an old order email Auth won't accept: a guest customer, never a retry loop.
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return null;
    throw error;
  }
}

async function authUser(uid: string): Promise<UserRecord | null> {
  try {
    return await getAuth().getUser(uid);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

/** Field holding the read time of the orders a doc was built from; an older build never overwrites a newer one. */
const BUILT_FROM_FIELD = 'builtFromReadTime';

function customerDoc(summary: CustomerSummary, builtFrom: Timestamp): Record<string, unknown> {
  const { firstOrderAtMs, lastOrderAtMs, createdAtMs, ...rest } = summary;
  return {
    ...rest,
    firstOrderAt: toTimestamp(firstOrderAtMs),
    lastOrderAt: toTimestamp(lastOrderAtMs),
    createdAt: toTimestamp(createdAtMs),
    [BUILT_FROM_FIELD]: builtFrom,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Rebuilds `customers/{sha256(email)}` from scratch: the newest 500 orders saved with that email
 * (any spelling the customer doc or this event knows), plus the account when the Auth user has a
 * `users/{uid}` doc. Never adds or subtracts, so the same event run twice writes the same totals.
 *
 * The orders are read outside the transaction, so a rebuild never locks orders that staff, Paymob
 * or checkout are writing. The transaction locks only the customer doc and writes only when this
 * read is newer than the one the doc was built from, so out-of-order events never leave older
 * totals. Deletes the doc when nothing is left (no orders and no account).
 *
 * `knownUser`: the Auth user when the caller already has it (undefined = look it up by email).
 */
export async function rebuildCustomer(
  db: Firestore,
  rawEmail: string,
  eventEmails: readonly string[] = [],
  knownUser?: UserRecord | null,
): Promise<void> {
  const email = customerEmailOf(rawEmail);
  if (!email) return;
  const user = knownUser !== undefined ? knownUser : await authUserByEmail(email);
  const ref = db.collection(CUSTOMERS_COLLECTION).doc(customerIdFromEmail(email));

  const before = await ref.get();
  const savedVariants = before.get('emailVariants');
  const lookup = emailLookupValues(email, [
    ...(Array.isArray(savedVariants) ? savedVariants : []),
    ...eventEmails,
  ]);
  const ordersSnap = await db
    .collection('orders')
    .where('customerEmail', 'in', lookup)
    .orderBy('createdAt', 'desc')
    .select(...CUSTOMER_ORDER_FIELDS)
    .limit(MAX_CUSTOMER_ORDERS)
    .get();
  const userSnap = user ? await db.collection('users').doc(user.uid).get() : null;

  const orders = ordersSnap.docs.map((doc) =>
    customerOrderFrom(doc.id, doc.data(), toMs(doc.get('createdAt'))),
  );
  const rawEmails = ordersSnap.docs
    .map((doc) => doc.get('customerEmail'))
    .filter((value): value is string => typeof value === 'string');
  const account =
    user && userSnap?.exists
      ? customerAccountFrom(
          user.uid,
          userSnap.data() ?? {},
          user.emailVerified,
          Date.parse(user.metadata.creationTime) || null,
        )
      : null;
  const summary = buildCustomerSummary(email, orders, account, rawEmails);
  const readTime = ordersSnap.readTime;

  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const builtFrom = current.get(BUILT_FROM_FIELD);
    if (builtFrom instanceof Timestamp && builtFrom.valueOf() > readTime.valueOf()) return;
    if (!summary) {
      if (current.exists) tx.delete(ref);
      return;
    }
    tx.set(ref, customerDoc(summary, readTime));
  });
}

/**
 * Every order write that changes what the customer shows (placed, status, total, address, email,
 * deleted) rebuilds the customer of
 * its email; when the email changed, both customers are rebuilt.
 */
export const onOrderWrittenUpdateCustomer = onDocumentWritten(
  { document: 'orders/{orderId}', ...TRIGGER_OPTIONS },
  async (event) => {
    if (!orderFieldsChanged(event.data?.before.data(), event.data?.after.data())) return;
    const raw = [event.data?.before.get('customerEmail'), event.data?.after.get('customerEmail')].filter(
      (value): value is string => typeof value === 'string' && customerEmailOf(value) !== null,
    );
    const byEmail = new Map<string, string[]>();
    for (const value of raw) {
      const email = normalizeCustomerEmail(value);
      byEmail.set(email, [...(byEmail.get(email) ?? []), value]);
    }
    const db = getFirestore();
    for (const [email, spellings] of byEmail) await rebuildCustomer(db, email, spellings);
  },
);

async function rebuildForUid(uid: string): Promise<void> {
  const user = await authUser(uid);
  if (!user?.email) {
    logger.info('Customer not updated: the account has no email', { uid });
    return;
  }
  await rebuildCustomer(getFirestore(), user.email, [], user);
}

/** A new account makes (or joins) the customer for its email, even before any order. */
export const onUserCreatedUpdateCustomer = onDocumentCreated(
  { document: 'users/{uid}', ...TRIGGER_OPTIONS },
  async (event) => rebuildForUid(event.params.uid),
);

/** Name, phone, address or email choice changed on the account. */
export const onUserUpdatedUpdateCustomer = onDocumentUpdated(
  { document: 'users/{uid}', ...TRIGGER_OPTIONS },
  async (event) => {
    if (!accountFieldsChanged(event.data?.before.data(), event.data?.after.data())) return;
    await rebuildForUid(event.params.uid);
  },
);

/**
 * A deleted account (`deleteMyAccount`) keeps its customer and order totals with `hasAccount`
 * false and no `uid`. The Auth user may already be gone, so the customer is found by `uid`.
 */
export const onUserDeletedUpdateCustomer = onDocumentDeleted(
  { document: 'users/{uid}', ...TRIGGER_OPTIONS },
  async (event) => {
    const db = getFirestore();
    const snap = await db
      .collection(CUSTOMERS_COLLECTION)
      .where('uid', '==', event.params.uid)
      .limit(10)
      .get();
    for (const doc of snap.docs) {
      const email = doc.get('email');
      if (typeof email === 'string') await rebuildCustomer(db, email);
    }
  },
);
