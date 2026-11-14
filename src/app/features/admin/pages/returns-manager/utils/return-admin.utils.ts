import { shopperWhatsappNumber } from '@core/config/order-messages';
import {
  returnKindLabel,
  returnStaffWhatsappText,
  returnStatusLabel,
  type ReturnStatus,
} from '@core/config/returns';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { orderDate } from '@core/services/orders/shopper-orders.service';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import { callableMessage, firebaseErrors, isFirebaseError } from '@shared/utils/firebase/firebase-errors';
import type {
  ReturnItemDoc,
  ReturnProductLookup,
  ReturnRequestDoc,
  ReturnStaffNotes,
} from '../models/return-admin.model';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function egp(amount: number): string {
  return formatMoney(amount, 'EGP', 0);
}

/** "13 Nov, 14:32", or '' when the date is unreadable. */
export function returnDate(raw: unknown): string {
  const date = orderDate(raw);
  return date ? DATE_TIME.format(date) : '';
}

/** Damaged and Wrong Item chips are black in the list so they stand out (design board 5). */
export interface ReturnKindChip {
  readonly label: string;
  readonly strong: boolean;
}

/** One row of the Returns list. */
export interface ReturnListRow {
  readonly id: string;
  readonly ref: string;
  readonly orderRef: string;
  readonly customerName: string;
  readonly status: ReturnStatus;
  readonly pieces: string;
  readonly chips: readonly ReturnKindChip[];
  readonly money: string;
  readonly createdAt: string;
  /** Lower-cased words the list search looks in. */
  readonly searchText: string;
}

export function returnListRow(request: ReturnRequestDoc): ReturnListRow {
  const asked = request.items.filter((item) => !item.autoGift);
  const pieces = asked.reduce((sum, item) => sum + item.quantity, 0);
  const kinds = [...new Set(asked.map((item) => item.kind))];
  return {
    id: request.id,
    ref: request.ref,
    orderRef: request.orderRef,
    customerName: request.customer.name || 'Customer',
    status: request.status,
    pieces: pieces === 1 ? '1 piece' : `${pieces} pieces`,
    chips: kinds.map((kind) => ({
      label: returnKindLabel(kind),
      strong: kind === 'damaged' || kind === 'wrong-item',
    })),
    money: moneyLine(request),
    createdAt: returnDate(request.createdAt),
    searchText: [
      request.ref,
      request.orderRef,
      request.customer.name,
      request.customer.phone,
      request.customer.email ?? '',
    ]
      .join(' ')
      .toLowerCase(),
  };
}

/** "Refund EGP 950", "Exchange · EGP 70 cash at the door", "Exchange · free visit". */
export function moneyLine(request: ReturnRequestDoc): string {
  if (request.hasRefund) return `Refund ${egp(request.refundEgp)}`;
  if (request.cashAtDoorEgp > 0) return `Exchange · ${egp(request.cashAtDoorEgp)} cash at the door`;
  return 'Exchange · free visit';
}

/** How the courier fee is paid, in words. */
export function feeLine(request: ReturnRequestDoc): string {
  if (request.feePaid === 'free' || request.feeEgp === 0) return 'Free, the store pays';
  if (request.feePaid === 'off-refund') return `${egp(request.feeEgp)} off the refund`;
  return `${egp(request.feeEgp)} cash at the door`;
}

/** One live stock count shown beside an item: "Size L · 3 left now". */
export interface StockFact {
  readonly label: string;
  readonly value: string;
}

/** One item of the request page. */
export interface ReturnItemView {
  readonly index: number;
  readonly name: string;
  readonly kindLabel: string;
  readonly asked: string;
  readonly options: string;
  readonly quantity: number;
  readonly imagePath: string | null;
  readonly imageSrc: string;
  readonly gift: boolean;
  readonly autoGift: boolean;
  readonly refund: string | null;
  readonly stock: readonly StockFact[];
  /** Item Received: this piece's "Can be sold again" choice when saved. */
  readonly soldAgain: string | null;
  readonly isWrongItem: boolean;
  readonly isDamaged: boolean;
}

export function returnItemViews(
  request: ReturnRequestDoc,
  products: ReadonlyMap<string, ReturnProductLookup>,
): ReturnItemView[] {
  return request.items.map((item, index) => ({
    index,
    name: item.name || 'Item',
    kindLabel: item.autoGift ? 'Free Gift' : returnKindLabel(item.kind),
    asked: item.askedLabel,
    options: item.optionLabels.map((option) => `${option.label}: ${option.value}`).join(' · '),
    quantity: item.quantity,
    imagePath: item.imagePath ?? null,
    imageSrc: item.imagePath ? normalizeImageKitPath(item.imagePath) : '',
    gift: item.gift,
    autoGift: item.autoGift,
    refund: item.refund && item.refundEgp > 0 ? egp(item.refundEgp) : null,
    stock: stockFacts(item, request.status, products),
    soldAgain:
      item.canBeSoldAgain === null ? null : item.canBeSoldAgain ? 'Back on the shelf' : 'Kept off the shelf',
    isWrongItem: item.kind === 'wrong-item',
    isDamaged: item.kind === 'damaged',
  }));
}

/**
 * Live stock for every piece an item touches, with what each step does to it (design board 6:
 * stock now, at Approve, at Item Received).
 */
function stockFacts(
  item: ReturnItemDoc,
  status: ReturnStatus,
  products: ReadonlyMap<string, ReturnProductLookup>,
): StockFact[] {
  const facts: StockFact[] = [];
  const open = status === 'requested' || status === 'approved';
  const add = (label: string, productId: string, selection: Record<string, string>, plan: string) => {
    facts.push({
      label: `${label}: ${pieceName(products.get(productId), selection)}`,
      value: `${countNow(products.get(productId), selection)}${open && plan ? ` · ${plan}` : ''}`,
    });
  };
  const n = item.quantity;
  switch (item.kind) {
    case 'different-size':
    case 'different-colour':
      if (item.newProductId) add('New piece', item.newProductId, item.newSelection ?? {}, `−${n} at Approve`);
      add('Coming back', item.productId, item.selection, `+${n} at Item Received if it can be sold again`);
      break;
    case 'return':
      add('Coming back', item.productId, item.selection, `+${n} at Item Received if it can be sold again`);
      break;
    case 'damaged':
      add(
        item.wants === 'send-another' ? 'Same piece' : 'Coming back',
        item.productId,
        item.selection,
        item.wants === 'send-another' ? `−${n} at Approve` : 'stays off the shelf unless you switch it on',
      );
      break;
    case 'wrong-item':
      add(
        'Ordered',
        item.productId,
        item.selection,
        item.wants === 'refund' ? `+${n} at Approve` : 'no change',
      );
      if (item.sentProductId) {
        add(
          'We sent',
          item.sentProductId,
          item.sentSelection ?? {},
          `−${n} at Approve, +${n} at Item Received`,
        );
      } else {
        facts.push({ label: 'We sent', value: 'You choose this at Approve' });
      }
      break;
  }
  return facts;
}

/**
 * What Reject does to stock for a request Approve already moved, one line per item (ATS-298).
 * Wrong Item Sent keeps both corrections: the piece we sent stays with the customer, and the
 * ordered piece stays on the shelf (Send the Right One gives it back, as we never sent it).
 */
export function rejectStockLines(
  request: ReturnRequestDoc,
  products: ReadonlyMap<string, ReturnProductLookup>,
): string[] {
  // Approved before ATS-298: the server undoes exactly what Approve moved.
  if (request.rejectStock == null) {
    return ['What Approve took out of stock goes back, and what it put back comes out again.'];
  }
  const lines: string[] = [];
  for (const item of request.items) {
    const count = item.quantity > 1 ? `${item.quantity} × ` : '';
    const name = (productId: string, selection: Record<string, string>) =>
      `${count}${pieceName(products.get(productId), selection)}`;
    const ordered = name(item.productId, item.selection);
    switch (item.kind) {
      case 'different-size':
      case 'different-colour':
        if (item.newProductId)
          lines.push(`${name(item.newProductId, item.newSelection ?? {})} goes back into stock.`);
        break;
      case 'damaged':
        if (item.wants === 'send-another') lines.push(`${ordered} goes back into stock.`);
        break;
      case 'wrong-item': {
        const sent = item.sentProductId
          ? `${name(item.sentProductId, item.sentSelection ?? {})} stays with the customer. `
          : '';
        lines.push(
          `${sent}${ordered} ${item.wants === 'refund' ? 'stays in stock' : 'goes back into stock'}.`,
        );
        break;
      }
    }
  }
  return lines;
}

function pieceName(product: ReturnProductLookup | undefined, selection: Record<string, string>): string {
  const size = selection['size'];
  const sizeName = size
    ? (product?.sizes.find((entry) => entry.id === size)?.label ?? size.toUpperCase())
    : null;
  const name = product?.name || 'Product removed';
  return sizeName ? `${name}, Size ${sizeName}` : name;
}

function countNow(product: ReturnProductLookup | undefined, selection: Record<string, string>): string {
  if (!product) return 'Not in the catalogue';
  const size = selection['size'];
  if (size && product.stockBySize) {
    if (!Object.hasOwn(product.stockBySize, size)) return 'Size no longer listed';
    return `${product.stockBySize[size] ?? 0} left now`;
  }
  return product.stock === null ? 'Stock not set' : `${product.stock} left now`;
}

/** Product ids whose live stock the request page shows. */
export function productIdsOfRequest(request: ReturnRequestDoc): string[] {
  const ids = new Set<string>();
  for (const item of request.items) {
    ids.add(item.productId);
    if (item.newProductId) ids.add(item.newProductId);
    if (item.sentProductId) ids.add(item.sentProductId);
  }
  return [...ids];
}

/** The black Next step bar (design board 6). */
export function returnNextStep(request: ReturnRequestDoc): string | null {
  switch (request.status) {
    case 'requested':
      return 'Check the request, then Approve or Reject it. Message the customer on WhatsApp to agree a courier visit.';
    case 'approved':
      return 'When the courier brings the items back, press Item Received.';
    case 'received':
      return request.hasRefund ? `Send ${egp(request.refundEgp)} by InstaPay, then press Refund Sent.` : null;
    default:
      return null;
  }
}

export function customerWhatsappUrl(request: ReturnRequestDoc): string | null {
  const number = shopperWhatsappNumber(request.customer.phone, request.customer.country);
  if (!number) return null;
  return whatsappChatUrl(
    number,
    returnStaffWhatsappText(request.ref, request.orderRef, request.customer.name, STORE_INFO.name),
  );
}

export interface ReturnHistoryEntry {
  readonly label: string;
  readonly when: string;
  readonly by: string | null;
  readonly reason: string | null;
}

export function returnHistory(
  request: ReturnRequestDoc,
  notes: ReturnStaffNotes | null,
): ReturnHistoryEntry[] {
  const sent: ReturnHistoryEntry = {
    label: 'Requested by the customer',
    when: returnDate(request.createdAt),
    by: null,
    reason: null,
  };
  const staff = (notes?.history ?? []).map((entry) => ({
    label: returnStatusLabel(entry.status),
    when: returnDate(entry.at),
    by: entry.byEmail || null,
    reason: entry.reason || null,
  }));
  return [sent, ...staff];
}

/** The snackbar after a step that left pieces off the shelf because the product or size is gone. */
export function notReturnedMessage(count: number): string {
  return count === 1
    ? '1 piece could not go back into stock because its product or size was removed. Check that product.'
    : `${count} pieces could not go back into stock because their product or size was removed. Check those products.`;
}

/** Prefer the callable's plain message. */
export function returnActionError(error: unknown): string {
  const message = callableMessage(error);
  if (message) return message;
  if (isFirebaseError(error) && error.code.startsWith('functions/'))
    return 'That did not work. Please try again.';
  return firebaseErrors(error);
}
