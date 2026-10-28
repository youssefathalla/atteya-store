import {
  FieldValue,
  getFirestore,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import {
  parseCreateIntlBankTransferRequest,
  type CreateIntlBankTransferRequest,
} from './order-request.js';
import {
  priceInternationalBankTransferOrder,
  whatsAppProofUrl,
  type OrderPricingSnapshot,
} from './order-pricing.server.js';
import type { PaymentSettings } from '../settings/payment-settings.js';
import { newTransferReference } from './transfer-reference.js';

export interface CreateIntlBankTransferOrderResponse {
  readonly orderId: string;
  readonly transferReference: string;
  readonly status: 'pending';
  readonly pricing: OrderPricingSnapshot;
  readonly iban: string;
  readonly beneficiaryName: string;
  readonly bankName: string;
  readonly whatsAppProofUrl: string | null;
}

export const createInternationalBankTransferOrder = onCall(
  adminCallableOptions(),
  async (request): Promise<CreateIntlBankTransferOrderResponse> => {
    const caller = await requireRole(request, 'user');
    const input = parseCreateIntlBankTransferRequest(request.data);
    const db = getFirestore();
    const priced = await priceInternationalBankTransferOrder(db, input, true);
    return db.runTransaction(async (tx) => {
      const orderRef = db.collection('orders').doc();
      const transferReference = await claimTransferReference(tx, db, orderRef.id);
      const now = FieldValue.serverTimestamp();
      const doc = buildOrderDocument({
        orderId: orderRef.id,
        customerId: caller.uid,
        customerEmail: caller.email ?? null,
        input,
        transferReference,
        pricing: priced.pricing,
        paymentSettings: priced.paymentSettings,
        whatsAppProofUrl: whatsAppProofUrl(
          priced.paymentSettings,
          transferReference,
          priced.pricing.totalDisplay,
          priced.pricing.currency,
        ),
      });
      tx.set(orderRef, { ...doc, createdAt: now, updatedAt: now });
      return {
        orderId: orderRef.id,
        transferReference,
        status: 'pending' as const,
        pricing: priced.pricing,
        iban: priced.paymentSettings.iban,
        beneficiaryName: priced.paymentSettings.beneficiaryName,
        bankName: priced.paymentSettings.bankName,
        whatsAppProofUrl: whatsAppProofUrl(
          priced.paymentSettings,
          transferReference,
          priced.pricing.totalDisplay,
          priced.pricing.currency,
        ),
      };
    });
  },
);

async function claimTransferReference(
  tx: Transaction,
  db: Firestore,
  orderId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = newTransferReference();
    const ref = db.collection('orderTransferRefs').doc(candidate);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, { orderId, reservedAt: FieldValue.serverTimestamp() });
      return candidate;
    }
  }
  throw new HttpsError(
    'resource-exhausted',
    'We could not create your order reference. Wait a moment and try again.',
  );
}

function buildOrderDocument(args: {
  readonly orderId: string;
  readonly customerId: string;
  readonly customerEmail: string | null;
  readonly input: CreateIntlBankTransferRequest;
  readonly transferReference: string;
  readonly pricing: OrderPricingSnapshot;
  readonly paymentSettings: PaymentSettings;
  readonly whatsAppProofUrl: string | null;
}): Record<string, unknown> {
  return {
    id: args.orderId,
    status: 'pending',
    paymentMethod: 'international-bank-transfer',
    transferReference: args.transferReference,
    customerId: args.customerId,
    customerEmail: args.customerEmail,
    shipping: args.input.shipping,
    pricing: args.pricing,
    bankTransfer: {
      iban: args.paymentSettings.iban,
      beneficiaryName: args.paymentSettings.beneficiaryName,
      bankName: args.paymentSettings.bankName,
      whatsAppProofUrl: args.whatsAppProofUrl,
    },
    paymentProofPath: null,
    confirmedAt: null,
    confirmedBy: null,
  };
}
