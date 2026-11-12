import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimId, orderEmailsForWrite } from './order-email-events.js';
import {
  orderConfirmationUrl,
  readOrderForEmail,
  shortOrderRef,
  type OrderEmailOrder,
} from './order-email-model.js';
import { orderStage, paymentDue } from '../store/order-messages.js';
import { formatEgp, renderOrderEmail, type OrderEmailContext } from './order-email-templates.js';

const ctx: OrderEmailContext = {
  storefrontUrl: 'https://shop.example',
  imageBaseUrl: 'https://ik.imagekit.io/atteyastore/dev',
  canReply: true,
  storeName: 'Atteya Store',
  whatsappNumber: '',
  instapay: { address: '', number: '' },
  bankTransfer: { accountName: '', bankName: '', iban: '', swift: '' },
};

const WA = '+20 120 565 8954';
const INSTAPAY = { address: 'atteya@instapay', number: '010 1234 5678' };
const withPay: OrderEmailContext = { ...ctx, whatsappNumber: WA, instapay: INSTAPAY };

function orderDoc(overrides: {
  status?: string;
  paymentMethod?: string;
  subtotalEgp?: number;
  shippingEgp?: number;
  country?: string;
  needsReview?: boolean;
  email?: string | null;
  /** Large order: `domestic-agreed` shipping, fee not set (`false`) or set (`true`). */
  feeAgreed?: boolean;
  /** Bank Transfer: the amount to send in the shopper's currency. */
  payIn?: { currency: string; amount: number };
}): Record<string, unknown> {
  const subtotal = overrides.subtotalEgp ?? 2370;
  const shipping = overrides.shippingEgp ?? 80;
  const country = overrides.country ?? 'EG';
  return {
    status: overrides.status ?? 'pending',
    paymentMethod: overrides.paymentMethod ?? 'cash-on-delivery',
    customerEmail: overrides.email === undefined ? 'shopper@example.com' : overrides.email,
    needsReview: overrides.needsReview ?? false,
    shipping: {
      fullName: 'Youssef Fathalla',
      line1: '12 Nile St',
      line2: null,
      city: 'Cairo',
      region: null,
      postalCode: country === 'EG' ? '' : 'SW1A 1AA',
      country,
      phone: '01012345678',
    },
    pricing: {
      isInternational: country !== 'EG',
      lines: [
        {
          productId: 'p1',
          quantity: 2,
          unitEgp: subtotal / 2,
          name: 'Padel Racket <Pro>',
          optionLabels: [{ label: 'Size', value: 'M' }],
          imagePath: 'products/p1/a b.jpg',
        },
      ],
      subtotalEgp: subtotal,
      shipping:
        overrides.feeAgreed === undefined
          ? { kind: 'domestic-box', boxId: 'box1', priceEgp: shipping, priceDisplay: shipping }
          : {
              kind: 'domestic-agreed',
              boxId: null,
              priceEgp: overrides.feeAgreed ? shipping : 0,
              priceDisplay: overrides.feeAgreed ? shipping : 0,
              feeAgreed: overrides.feeAgreed,
            },
      totalEgp: overrides.feeAgreed === false ? subtotal : subtotal + shipping,
      ...(overrides.payIn ? { payIn: overrides.payIn } : {}),
    },
  };
}

function read(doc: Record<string, unknown>, id = 'abcdef123456'): OrderEmailOrder {
  const order = readOrderForEmail(id, doc);
  assert.ok(order);
  return order;
}

describe('shortOrderRef', () => {
  it('is # plus the first 6 characters in capitals', () => {
    assert.equal(shortOrderRef('a1b2c3XYZ'), '#A1B2C3');
  });
});

describe('orderEmailsForWrite', () => {
  it('cash on delivery placed: shopper + store alert', () => {
    assert.deepEqual(orderEmailsForWrite(null, read(orderDoc({}))), ['cod-placed', 'store-new-order']);
  });

  it('cash on delivery confirmed by admin: shopper only', () => {
    const before = read(orderDoc({}));
    const after = read(orderDoc({ status: 'confirmed' }));
    assert.deepEqual(orderEmailsForWrite(before, after), ['cod-confirmed']);
  });

  it('shipped and delivered send one shopper email each, for every payment method', () => {
    for (const paymentMethod of ['cash-on-delivery', 'instapay', 'paymob']) {
      const confirmed = read(orderDoc({ paymentMethod, status: 'confirmed' }));
      const shipped = read(orderDoc({ paymentMethod, status: 'shipped' }));
      const delivered = read(orderDoc({ paymentMethod, status: 'delivered' }));
      assert.deepEqual(orderEmailsForWrite(confirmed, shipped), ['order-shipped'], paymentMethod);
      assert.deepEqual(orderEmailsForWrite(shipped, delivered), ['order-delivered'], paymentMethod);
    }
  });

  it('a step back sends nothing, and never a second confirmation', () => {
    const confirmed = read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed' }));
    const shipped = read(orderDoc({ paymentMethod: 'paymob', status: 'shipped' }));
    const delivered = read(orderDoc({ paymentMethod: 'paymob', status: 'delivered' }));
    assert.deepEqual(orderEmailsForWrite(shipped, confirmed), []);
    assert.deepEqual(orderEmailsForWrite(delivered, shipped), []);
    const codShipped = read(orderDoc({ status: 'shipped' }));
    assert.deepEqual(orderEmailsForWrite(codShipped, read(orderDoc({ status: 'confirmed' }))), []);
  });

  it('shipped and delivered are claimed once per order', () => {
    const order = read(orderDoc({ status: 'shipped' }));
    assert.equal(claimId('order-shipped', order), `${order.id}_order-shipped`);
    assert.equal(claimId('order-delivered', order), `${order.id}_order-delivered`);
  });

  it('shipped email reminds Cash on Delivery of the cash and links a guest with its key', () => {
    const cod = renderOrderEmail('order-shipped', read(orderDoc({ status: 'shipped' })), ctx);
    assert.match(cod.subject, /is on its way/);
    assert.match(cod.text, new RegExp(`Have ready in cash: ${formatEgp(2370)}`));
    assert.match(cod.html, />ON ITS<br>WAY</);
    assert.doesNotMatch(cod.text, /EGP 2,450|EGP 1,185/, 'shipped items show no prices');
    const card = renderOrderEmail(
      'order-shipped',
      read(orderDoc({ paymentMethod: 'paymob', status: 'shipped' })),
      ctx,
    );
    assert.doesNotMatch(card.text, /in cash/i);
    const dated = renderOrderEmail(
      'order-shipped',
      read({ ...orderDoc({ status: 'shipped' }), shippedAt: new Date('2026-11-14T10:00:00Z') }),
      ctx,
    );
    assert.match(dated.text, /Shipped 14 Nov · Order #ABCDEF/);
    assert.match(cod.text, /^Shipped · Order #ABCDEF/m);
    const guest = renderOrderEmail(
      'order-delivered',
      read({ ...orderDoc({ status: 'delivered' }), viewKey: 'k'.repeat(43) }),
      ctx,
    );
    assert.match(guest.subject, /was delivered/);
    assert.match(guest.html, /\?key=k{43}/);
    assert.match(guest.text, /Shop New Arrivals: https:\/\/shop\.example\/shop\?newArrivals=1/);
    assert.match(guest.html, /IT&#39;S<br>HERE/);
  });

  it('cash on delivery edit without a status change sends nothing', () => {
    const before = read(orderDoc({ status: 'confirmed' }));
    const after = read(orderDoc({ status: 'confirmed' }));
    assert.deepEqual(orderEmailsForWrite(before, after), []);
  });

  it('Paymob order created as pending sends nothing', () => {
    assert.deepEqual(orderEmailsForWrite(null, read(orderDoc({ paymentMethod: 'paymob' }))), []);
  });

  it('Paymob confirmed: shopper + store alert', () => {
    const before = read(orderDoc({ paymentMethod: 'paymob' }));
    const after = read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed' }));
    assert.deepEqual(orderEmailsForWrite(before, after), ['paid-confirmed', 'store-new-order']);
  });

  it('Paymob failed: shopper only, once', () => {
    const pending = read(orderDoc({ paymentMethod: 'paymob' }));
    const failed = read(orderDoc({ paymentMethod: 'paymob', status: 'failed' }));
    assert.deepEqual(orderEmailsForWrite(pending, failed), ['payment-failed']);
    assert.deepEqual(orderEmailsForWrite(failed, failed), []);
  });

  it('Paymob failed then paid later still confirms', () => {
    const failed = read(orderDoc({ paymentMethod: 'paymob', status: 'failed' }));
    const paid = read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed' }));
    assert.deepEqual(orderEmailsForWrite(failed, paid), ['paid-confirmed', 'store-new-order']);
  });
});

describe('InstaPay emails', () => {
  it('InstaPay placed: shopper + store alert; confirmed: shopper only', () => {
    const pending = read(orderDoc({ paymentMethod: 'instapay' }));
    const confirmed = read(orderDoc({ paymentMethod: 'instapay', status: 'confirmed' }));
    const cancelled = read(orderDoc({ paymentMethod: 'instapay', status: 'cancelled' }));
    assert.deepEqual(orderEmailsForWrite(null, pending), ['instapay-placed', 'store-new-order']);
    assert.deepEqual(orderEmailsForWrite(pending, confirmed), ['instapay-confirmed']);
    assert.deepEqual(orderEmailsForWrite(pending, cancelled), []);
  });

  it('InstaPay placed asks for the full total with the InstaPay details and a WhatsApp button', () => {
    const email = renderOrderEmail('instapay-placed', read(orderDoc({ paymentMethod: 'instapay' })), withPay);
    assert.ok(email.text.includes(`Send by InstaPay: ${formatEgp(2450)}`));
    assert.ok(email.text.includes(`2. Send the total by InstaPay: ${formatEgp(2450)}`));
    assert.ok(email.text.includes('InstaPay address: atteya@instapay'));
    assert.ok(email.text.includes('InstaPay number: 010 1234 5678'));
    assert.ok(email.text.includes('3. Send the screenshot on WhatsApp'));
    assert.ok(email.text.includes('Send Screenshot on WhatsApp: https://wa.me/201205658954?text='));
    assert.ok(email.html.includes('>atteya@instapay<'));
    assert.ok(email.html.includes('https://wa.me/201205658954?text='));
    const text = decodeURIComponent(email.text.split('?text=')[1]?.split(/\s/)[0] ?? '');
    assert.match(text, /#ABCDEF/);
    assert.match(text, /2,450 EGP/);
  });

  it('InstaPay placed without details set says we will send them', () => {
    const email = renderOrderEmail('instapay-placed', read(orderDoc({ paymentMethod: 'instapay' })), {
      ...withPay,
      instapay: { address: '', number: '' },
    });
    assert.match(email.text, /We'll send you the InstaPay details on WhatsApp/);
    assert.ok(!email.text.includes('screenshot'));
  });

  it('cash on delivery placed asks for the fee only by InstaPay', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), withPay);
    assert.ok(email.text.includes(`2. Send the shipping fee by InstaPay: ${formatEgp(80)}`));
    assert.ok(email.text.includes(`Pay now: ${formatEgp(80)}`));
    assert.ok(email.text.includes(`At your door: ${formatEgp(2370)}`));
    assert.ok(!email.text.includes('Send the total by InstaPay'));
  });

  it('free shipping cash on delivery has no InstaPay box', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({ shippingEgp: 0 })), withPay);
    assert.ok(!email.text.includes('InstaPay'));
    assert.ok(!email.text.includes('screenshot'));
  });

  it('paid and confirmed emails never ask for money or a screenshot', () => {
    const cases = [
      ['instapay-confirmed', orderDoc({ paymentMethod: 'instapay', status: 'confirmed' })],
      ['paid-confirmed', orderDoc({ paymentMethod: 'paymob', status: 'confirmed' })],
      ['cod-confirmed', orderDoc({ status: 'confirmed' })],
    ] as const;
    for (const [kind, doc] of cases) {
      const email = renderOrderEmail(kind, read(doc), withPay);
      assert.ok(!/screenshot|InstaPay address|InstaPay number/.test(email.text), kind);
    }
    const paid = renderOrderEmail(
      'instapay-confirmed',
      read(orderDoc({ paymentMethod: 'instapay', status: 'confirmed' })),
      withPay,
    );
    assert.ok(paid.text.includes(`Paid by InstaPay: ${formatEgp(2450)}`));
    assert.ok(paid.text.includes(`Total paid: ${formatEgp(2450)}`));
    assert.match(paid.html, />ORDER<br>CONFIRMED</);
  });

  it('store alert says InstaPay is waiting for the transfer', () => {
    const email = renderOrderEmail('store-new-order', read(orderDoc({ paymentMethod: 'instapay' })), ctx);
    assert.match(email.subject, /InstaPay – Waiting for Transfer/);
    assert.ok(email.text.includes(`Waiting for Transfer: ${formatEgp(2450)}`));
    assert.ok(email.text.includes(`Next Step: Wait for ${formatEgp(2450)} on InstaPay`));
    assert.match(email.text, /once you see it in your bank app/);
  });
});

describe('order email wording and amounts', () => {
  it('cash on delivery placed asks for the shipping fee first, then the rest', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.equal(email.subject, 'We got your order #ABCDEF');
    assert.match(email.text, /Cash on Delivery · Order #ABCDEF/);
    assert.ok(!/whatsapp/i.test(email.text + email.html), 'no WhatsApp mention');
    assert.ok(email.text.includes(`Pay now: ${formatEgp(80)}`));
    assert.ok(email.text.includes(`3. Pay the rest in cash at your door: ${formatEgp(2370)}`));
    assert.ok(email.text.includes(`Total: ${formatEgp(2450)}`));
    assert.ok(!email.text.includes('01012345678'), 'shopper emails never repeat the phone');
  });

  it('cash on delivery with free shipping has no deposit', () => {
    const order = read(orderDoc({ shippingEgp: 0 }));
    const placed = renderOrderEmail('cod-placed', order, ctx);
    assert.match(placed.text, /Shipping is free on this order, so there's nothing to pay now/);
    assert.ok(placed.text.includes(`At your door: ${formatEgp(2370)}`));
    assert.ok(placed.text.includes('Shipping: Free'));
    assert.ok(!placed.text.includes('Pay now'));
    assert.ok(!placed.text.includes('shipping fee of'));
    const confirmed = renderOrderEmail('cod-confirmed', order, ctx);
    assert.ok(!confirmed.text.includes('received your shipping fee'));
    const alert = renderOrderEmail('store-new-order', order, ctx);
    assert.ok(alert.text.includes(`Fee by InstaPay: Free\nCash at Door: ${formatEgp(2370)}`));
    assert.ok(!alert.text.includes('arrives on InstaPay'), 'no fee to wait for');
    assert.ok(!alert.text.includes('Next Step'), 'no next-step box without a note');
  });

  it('cash on delivery confirmed: fee received, cash amount is total minus shipping', () => {
    const email = renderOrderEmail('cod-confirmed', read(orderDoc({ status: 'confirmed' })), ctx);
    assert.match(email.text, /received your shipping fee/);
    assert.ok(email.text.includes(`Have ready in cash: ${formatEgp(2370)}`));
    assert.ok(email.text.includes(`Shipping fee ${formatEgp(80)} already paid.`));
    assert.ok(email.text.includes(`Cash at your door: ${formatEgp(2370)}`));
    assert.ok(email.text.includes(`Shipping · paid: ${formatEgp(80)}`));
  });

  it('paid online: full total, EGP note only abroad', () => {
    const egypt = renderOrderEmail(
      'paid-confirmed',
      read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed' })),
      ctx,
    );
    assert.ok(egypt.text.includes(`Paid by Card: ${formatEgp(2450)}`));
    assert.ok(egypt.text.includes(`Total paid: ${formatEgp(2450)}`));
    assert.ok(!egypt.text.includes('Egyptian pounds'));
    assert.ok(!egypt.text.includes('cash'));

    const abroad = renderOrderEmail(
      'paid-confirmed',
      read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed', country: 'GB' })),
      ctx,
    );
    assert.match(abroad.text, /charged in Egyptian pounds/);
    assert.match(abroad.text, /United Kingdom/);
  });

  it('payment failed: not charged, links to the shop (the bag is already empty)', () => {
    const email = renderOrderEmail(
      'payment-failed',
      read(orderDoc({ paymentMethod: 'paymob', status: 'failed' })),
      ctx,
    );
    assert.match(email.text, /haven't been charged/);
    assert.ok(email.text.includes('Shop Again: https://shop.example/shop'));
    assert.ok(!email.text.toLowerCase().includes('bag'));
  });

  it('store alert: amounts to collect, phone, and the sold-out warning', () => {
    const cod = renderOrderEmail('store-new-order', read(orderDoc({})), ctx);
    assert.equal(cod.subject, `New Order #ABCDEF – ${formatEgp(2450)} – Cash on Delivery`);
    assert.ok(
      cod.text.includes(`Items: 2\nFee by InstaPay: ${formatEgp(80)}\nCash at Door: ${formatEgp(2370)}`),
    );
    assert.ok(cod.text.includes('Phone: 01012345678'));
    assert.ok(cod.html.includes('href="tel:01012345678"'));

    const paid = renderOrderEmail(
      'store-new-order',
      read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed', needsReview: true })),
      ctx,
    );
    assert.match(paid.subject, /Paid Online$/);
    assert.ok(paid.text.includes(`Paid: ${formatEgp(2450)}`));
    assert.match(paid.text, /sold out before this payment/);
  });

  it('escapes product names and builds photo links', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.ok(email.html.includes('Padel Racket &lt;Pro&gt;'));
    assert.ok(!email.html.includes('<Pro>'));
    assert.ok(email.html.includes('https://ik.imagekit.io/atteyastore/dev/products/p1/a%20b.jpg?tr='));
  });

  it('skips orders without an email address for the shopper', () => {
    const order = read(orderDoc({ email: null }));
    assert.equal(order.customerEmail, null);
  });
});

describe('order email photos', () => {
  it('leaves out the photo when an item has no photo', () => {
    const doc = orderDoc({});
    const pricing = doc['pricing'] as { lines: Record<string, unknown>[] };
    pricing.lines[0]!['imagePath'] = null;
    const email = renderOrderEmail('cod-placed', read(doc), ctx);
    assert.ok(!email.html.includes('<img'));
    assert.ok(email.html.includes('Padel Racket &lt;Pro&gt;'));
  });

  it('lists every item in the Pack List with its quantity and price, and counts every unit', () => {
    const email = renderOrderEmail('store-new-order', read(orderDoc({})), ctx);
    assert.ok(email.html.includes('>Pack List<'));
    assert.ok(email.html.includes('>×2<'));
    assert.ok(email.text.includes(`- ×2 Padel Racket <Pro> (Size M): ${formatEgp(2370)}`));
    assert.ok(email.text.includes('Items: 2'));
  });
});

describe('order email Buy X Get Y', () => {
  it('shows the discounted line price with a Free tag', () => {
    const doc = orderDoc({ subtotalEgp: 2000 });
    const pricing = doc['pricing'] as { lines: Record<string, unknown>[] };
    pricing.lines[0]!['discountEgp'] = 1000;
    pricing.lines[0]!['deals'] = [{ offerId: 'b2g1', units: 1, percent: 100, discountEgp: 1000 }];
    const order = read(doc);
    assert.equal(order.lines[0]!.lineEgp, 1000);
    assert.equal(order.lines[0]!.dealTag, '1 free');
    const email = renderOrderEmail('cod-placed', order, ctx);
    assert.ok(email.html.includes('>1 FREE<'));
    assert.ok(email.text.includes(`${formatEgp(1000)} (1 free)`));
  });

  it('reads the line before the discount from fullEgp when group pieces lost their per-item offer', () => {
    const doc = orderDoc({});
    const pricing = doc['pricing'] as { lines: Record<string, unknown>[] };
    // 3 pieces with 10% off (900) in a Buy 2 get 1 free group: they pay 1,000 each, one free.
    pricing.lines[0]!['quantity'] = 3;
    pricing.lines[0]!['unitEgp'] = 900;
    pricing.lines[0]!['fullEgp'] = 3000;
    pricing.lines[0]!['discountEgp'] = 1000;
    pricing.lines[0]!['deals'] = [{ offerId: 'b2g1', units: 1, percent: 100, discountEgp: 1000 }];
    assert.equal(read(doc).lines[0]!.lineEgp, 2000);
  });
});

describe('order email help line', () => {
  it('shows the business WhatsApp number with a chat link when set', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), withPay);
    assert.ok(email.text.includes('Questions? We answer on WhatsApp.'));
    assert.ok(email.text.includes('Message Us on WhatsApp: +20 120 565 8954 (https://wa.me/201205658954)'));
    assert.ok(email.html.includes('href="https://wa.me/201205658954"'));
    assert.ok(!email.text.includes('reply to this email'));
  });

  it('falls back to "reply to this email" without a number', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.ok(email.text.includes('Questions? Just reply to this email.'));
    assert.ok(!email.html.includes('wa.me'));
  });

  it('never puts the WhatsApp line in the store alert', () => {
    const email = renderOrderEmail('store-new-order', read(orderDoc({})), {
      ...ctx,
      whatsappNumber: '+20 120 565 8954',
    });
    assert.ok(!email.text.includes('Message us on WhatsApp'));
  });
});

describe('store info', () => {
  it('turns any readable WhatsApp number into a wa.me link, and empty into none', async () => {
    const { whatsappChatUrl, STORE_INFO } = await import('../store/store-info.js');
    assert.equal(whatsappChatUrl('+20 120 565 8954'), 'https://wa.me/201205658954');
    assert.equal(whatsappChatUrl(''), null);
    assert.equal(STORE_INFO.name, 'Atteya Store');
  });
});

describe('large order: delivery fee to be agreed', () => {
  const placed = read(orderDoc({ feeAgreed: false }));
  const set = read(orderDoc({ feeAgreed: true, shippingEgp: 250 }));

  it('reads the fee as not agreed until staff set it', () => {
    assert.equal(placed.feeToBeAgreed, true);
    assert.equal(placed.totalEgp, 2370);
    assert.equal(set.feeToBeAgreed, false);
    assert.equal(set.totalEgp, 2620);
  });

  it('sends the delivery-fee email when the fee is first saved, and again on each change', () => {
    assert.deepEqual(orderEmailsForWrite(null, placed), ['cod-placed', 'store-new-order']);
    assert.deepEqual(orderEmailsForWrite(placed, set), ['delivery-fee-set']);
    // A write that keeps the fee sends nothing; a different fee tells the shopper.
    assert.deepEqual(orderEmailsForWrite(set, set), []);
    const changed = read(orderDoc({ feeAgreed: true, shippingEgp: 300 }));
    assert.deepEqual(orderEmailsForWrite(set, changed), ['delivery-fee-changed']);
    // Confirming after the fee is set is just the confirmation.
    const confirmed = read(orderDoc({ feeAgreed: true, shippingEgp: 250, status: 'confirmed' }));
    assert.deepEqual(orderEmailsForWrite(set, confirmed), ['cod-confirmed']);
    // A normal order whose shipping differs between writes never gets the fee emails.
    assert.deepEqual(orderEmailsForWrite(read(orderDoc({})), read(orderDoc({ shippingEgp: 90 }))), []);
    const instapayPlaced = read(orderDoc({ paymentMethod: 'instapay', feeAgreed: false }));
    const instapaySet = read(orderDoc({ paymentMethod: 'instapay', feeAgreed: true }));
    assert.deepEqual(orderEmailsForWrite(instapayPlaced, instapaySet), ['delivery-fee-set']);
  });

  it('fee-changed email says the fee is now different and shows the new InstaPay amount', () => {
    const changed = read(orderDoc({ paymentMethod: 'instapay', feeAgreed: true, shippingEgp: 300 }));
    const email = renderOrderEmail('delivery-fee-changed', changed, withPay);
    assert.match(email.subject, /Updated delivery fee/);
    assert.match(email.text, new RegExp(`is now ${formatEgp(300)}`));
    assert.match(email.text, /already sent a different amount/);
    assert.match(email.text, new RegExp(formatEgp(2670)));
  });

  it('claims the fee-changed email per save, every other email once per order', () => {
    const changed = read(orderDoc({ feeAgreed: true, shippingEgp: 300 }));
    assert.equal(claimId('delivery-fee-set', set), 'abcdef123456_delivery-fee-set');
    assert.equal(claimId('delivery-fee-changed', changed), 'abcdef123456_delivery-fee-changed_300');
    const withTime = readOrderForEmail('abcdef123456', {
      ...orderDoc({ feeAgreed: true, shippingEgp: 300 }),
      deliveryFeeSetAt: new Date(1_700_000_000_000),
    });
    assert.ok(withTime);
    assert.equal(withTime.deliveryFeeSetAtMs, 1_700_000_000_000);
    assert.equal(
      claimId('delivery-fee-changed', withTime),
      'abcdef123456_delivery-fee-changed_1700000000000',
    );
  });

  it('placed emails say we will agree the fee on WhatsApp and ask for no payment', () => {
    for (const kind of ['cod-placed', 'instapay-placed'] as const) {
      const order = read(
        orderDoc({
          paymentMethod: kind === 'cod-placed' ? 'cash-on-delivery' : 'instapay',
          feeAgreed: false,
        }),
      );
      const email = renderOrderEmail(kind, order, withPay);
      assert.match(email.text, /message you on WhatsApp to agree the delivery fee/);
      assert.match(email.text, /To pay now: Nothing yet/);
      assert.match(email.text, /Delivery: We'll message you/);
      assert.match(email.text, /Delivery fee coming soon/);
      assert.match(email.text, /We'll message you on WhatsApp with the delivery fee\./);
      assert.doesNotMatch(email.text, /To be agreed|to be agreed|once we agree/);
      assert.match(email.text, new RegExp(`Total: ${formatEgp(2370)} \\+ delivery`));
      assert.doesNotMatch(email.text, /atteya@instapay|screenshot/);
    }
  });

  it('store alert asks staff to agree the fee', () => {
    const email = renderOrderEmail('store-new-order', placed, withPay);
    assert.match(email.subject, /Agree Delivery Fee/);
    assert.match(email.text, /Delivery Fee: Not Set Yet/);
    assert.match(email.text, /Delivery: Not set yet/);
  });

  it('fee-set email shows the fee and the InstaPay box for it', () => {
    const email = renderOrderEmail('delivery-fee-set', set, withPay);
    assert.match(email.text, new RegExp(`delivery fee for your order #ABCDEF is ${formatEgp(250)}`));
    assert.match(email.text, /atteya@instapay/);
    assert.match(email.text, new RegExp(`Pay now: ${formatEgp(250)}`));
    assert.match(email.text, /2\. Agree the delivery fee ✓/);
    assert.match(email.text, new RegExp(`3\\. Send the delivery fee by InstaPay: ${formatEgp(250)}`));
    assert.match(email.html, />FEE<br>READY</);
  });
});

describe('order page link', () => {
  const KEY = 'k'.repeat(43);

  it('a signed-in order links to the order page without a key', () => {
    assert.equal(
      orderConfirmationUrl('https://shop.example', 'abc123', null),
      'https://shop.example/checkout/confirmation/abc123',
    );
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.ok(email.text.includes('https://shop.example/checkout/confirmation/abcdef123456'));
    assert.ok(!email.text.includes('?key='));
  });

  it('a guest order carries its view key in every View Your Order link', () => {
    assert.equal(
      orderConfirmationUrl('https://shop.example', 'abc123', KEY),
      `https://shop.example/checkout/confirmation/abc123?key=${KEY}`,
    );
    const order = read({ ...orderDoc({}), customerId: null, viewKey: KEY });
    assert.equal(order.viewKey, KEY);
    for (const kind of ['cod-placed', 'cod-confirmed'] as const) {
      const email = renderOrderEmail(kind, order, ctx);
      assert.ok(email.text.includes(`/checkout/confirmation/abcdef123456?key=${KEY}`), kind);
      assert.ok(email.html.includes(`/checkout/confirmation/abcdef123456?key=${KEY}`), kind);
    }
  });
});

describe('Bank Transfer emails', () => {
  const BANK = {
    accountName: 'Youseif Tamer Elsayed Ibrahim Atteya',
    bankName: 'National Bank of Egypt',
    iban: 'EG520003023350016856630000150',
    swift: 'NBEGEGCXXXX',
  };
  const withBank: OrderEmailContext = { ...ctx, whatsappNumber: WA, bankTransfer: BANK };
  const bankDoc = (status = 'pending') =>
    orderDoc({
      paymentMethod: 'bank-transfer',
      country: 'US',
      status,
      payIn: { currency: 'USD', amount: 205 },
    });

  it('placed: shopper + store alert; confirmed: shopper only', () => {
    const pending = read(bankDoc());
    const confirmed = read(bankDoc('confirmed'));
    assert.deepEqual(orderEmailsForWrite(null, pending), ['bank-transfer-placed', 'store-new-order']);
    assert.deepEqual(orderEmailsForWrite(pending, confirmed), ['bank-transfer-confirmed']);
    assert.deepEqual(orderEmailsForWrite(pending, read(bankDoc('cancelled'))), []);
  });

  it('placed asks for the amount in the shopper currency with the bank details and the fee line', () => {
    const email = renderOrderEmail('bank-transfer-placed', read(bankDoc()), withBank);
    assert.match(email.text, /Send from your bank: \$205/);
    assert.ok(email.text.includes(`Same total as ${formatEgp(2450)}. Item prices below are in EGP.`));
    assert.match(email.text, /2\. Send \$205 from your bank/);
    assert.match(email.text, /You send: \$205/);
    assert.match(email.text, /IBAN: EG52 0003 0233 5001 6856 6300 0015 0/);
    assert.match(email.text, /SWIFT \/ BIC: NBEGEGCXXXX/);
    assert.match(email.text, /Bank: National Bank of Egypt/);
    assert.match(email.text, /Account name: Youseif Tamer Elsayed Ibrahim Atteya/);
    assert.match(email.text, /Reference: ABCDEF/);
    assert.match(email.text, /Choose "I pay all fees" in your bank app so the full amount reaches us\./);
    assert.match(email.text, /Send Receipt on WhatsApp: https:\/\/wa\.me\//);
    assert.match(email.text, /View Your Order: /);
    assert.doesNotMatch(email.text, /InstaPay/);
    const message = decodeURIComponent(email.text.split('?text=')[1]?.split(/\s/)[0] ?? '');
    assert.match(message, /205 USD/);
    assert.match(message, /#ABCDEF/);
    assert.match(email.html, /Send Receipt on WhatsApp/);
  });

  it('placed without bank details says we will send them', () => {
    const email = renderOrderEmail('bank-transfer-placed', read(bankDoc()), { ...ctx, whatsappNumber: WA });
    assert.match(email.text, /We'll send you our bank details on WhatsApp\./);
    assert.doesNotMatch(email.text, /IBAN/);
  });

  it('confirmed names the amount sent and never asks for money', () => {
    const email = renderOrderEmail('bank-transfer-confirmed', read(bankDoc('confirmed')), withBank);
    assert.match(email.text, /Paid by Bank Transfer: \$205/);
    assert.match(email.text, /You sent: \$205/);
    assert.doesNotMatch(email.text, /IBAN|Send Receipt/);
  });

  it('store alert shows the method, the amount in the shopper currency and the EGP total', () => {
    const email = renderOrderEmail('store-new-order', read(bankDoc()), withBank);
    assert.match(email.subject, /Bank Transfer – Waiting for Transfer/);
    assert.match(email.text, /#ABCDEF · Bank Transfer/);
    assert.match(email.text, /Customer Sends: \$205\nOrder Total in EGP: /);
    assert.match(email.text, /Next Step: Wait for \$205 by bank transfer/);
    assert.ok(email.text.includes(formatEgp(2450)));
  });
});

describe('Bold Black shopper emails (<KEY>-221)', () => {
  const BANK = {
    accountName: 'Atteya Store',
    bankName: 'National Bank of Egypt',
    iban: 'EG520003023350016856630000150',
    swift: 'NBEGEGCXXXX',
  };
  const full: OrderEmailContext = { ...withPay, bankTransfer: BANK };
  const kinds = [
    ['cod-placed', orderDoc({})],
    ['cod-placed', orderDoc({ shippingEgp: 0 })],
    ['cod-placed', orderDoc({ feeAgreed: false })],
    ['cod-confirmed', orderDoc({ status: 'confirmed' })],
    ['instapay-placed', orderDoc({ paymentMethod: 'instapay' })],
    ['instapay-placed', orderDoc({ paymentMethod: 'instapay', feeAgreed: false })],
    ['instapay-confirmed', orderDoc({ paymentMethod: 'instapay', status: 'confirmed' })],
    [
      'bank-transfer-placed',
      orderDoc({ paymentMethod: 'bank-transfer', country: 'US', payIn: { currency: 'USD', amount: 205 } }),
    ],
    [
      'bank-transfer-confirmed',
      orderDoc({
        paymentMethod: 'bank-transfer',
        country: 'US',
        status: 'confirmed',
        payIn: { currency: 'USD', amount: 205 },
      }),
    ],
    ['delivery-fee-set', orderDoc({ feeAgreed: true, shippingEgp: 250 })],
    ['delivery-fee-changed', orderDoc({ feeAgreed: true, shippingEgp: 300, paymentMethod: 'instapay' })],
    ['paid-confirmed', orderDoc({ paymentMethod: 'paymob', status: 'confirmed' })],
    ['payment-failed', orderDoc({ paymentMethod: 'paymob', status: 'failed' })],
    ['order-shipped', orderDoc({ status: 'shipped' })],
    ['order-delivered', orderDoc({ status: 'delivered' })],
  ] as const;

  it('renders every shopper email with the black header, the order ref and email-safe HTML', () => {
    for (const [kind, doc] of kinds) {
      const email = renderOrderEmail(kind, read(doc), full);
      assert.ok(email.subject.length > 0, kind);
      assert.match(email.html, /<h1 class="status"/, kind);
      assert.ok(email.html.includes('#ABCDEF'), kind);
      assert.ok(email.text.includes('Order #ABCDEF'), kind);
      assert.ok(email.html.includes('ATTEYA STORE'), kind);
      assert.doesNotMatch(email.html, /display:\s*(flex|grid)|position:\s*(absolute|relative|fixed)/, kind);
      assert.doesNotMatch(email.html, /<button/, kind);
      assert.ok(email.text.endsWith('\n'), kind);
    }
  });

  it('shows the InstaPay or bank box only when paymentDue() says money is owed', () => {
    for (const [kind, doc] of kinds) {
      const order = read(doc);
      const input = {
        ref: order.ref,
        paymentMethod: order.paymentMethod,
        status: order.status,
        country: order.address.country,
        shippingEgp: order.feeToBeAgreed ? null : order.shippingEgp,
        totalEgp: order.feeToBeAgreed ? null : order.totalEgp,
        needsReview: order.needsReview,
        feeToBeAgreed: order.feeToBeAgreed,
        payIn: order.payIn,
      };
      const due = paymentDue(orderStage(input), input);
      const email = renderOrderEmail(kind, order, full);
      const hasBox = /atteya@instapay|EG52 0003|screenshot|Send Receipt/.test(email.text + email.html);
      assert.equal(hasBox, due !== null, kind);
    }
  });

  it('amounts come from the saved order', () => {
    const order = read(orderDoc({ subtotalEgp: 3000, shippingEgp: 120 }));
    const email = renderOrderEmail('cod-placed', order, full);
    assert.ok(email.text.includes(`Subtotal: ${formatEgp(3000)}`));
    assert.ok(email.text.includes(`Shipping: ${formatEgp(120)}`));
    assert.ok(email.text.includes(`Total: ${formatEgp(3120)}`));
    assert.ok(email.text.includes(`Pay now: ${formatEgp(120)}`));
    assert.ok(email.text.includes(`At your door: ${formatEgp(3000)}`));
  });

  it('uses 2 photos per row up to 4 items, then a compact list', () => {
    const many = orderDoc({});
    const pricing = many['pricing'] as { lines: Record<string, unknown>[] };
    const base = pricing.lines[0]!;
    pricing.lines = Array.from({ length: 5 }, (_, i) => ({ ...base, productId: `p${i}`, quantity: 1 }));
    const long = renderOrderEmail('cod-placed', read(many), full);
    assert.ok(long.html.includes('width="64"'), 'compact list');
    const short = renderOrderEmail('cod-placed', read(orderDoc({})), full);
    assert.ok(!short.html.includes('width="64"'));
    assert.ok(short.html.includes('?tr=w-520,'), 'big photos');
  });

  it('marks a free gift with a FREE GIFT tag and a Free price', () => {
    const doc = orderDoc({});
    const pricing = doc['pricing'] as { lines: Record<string, unknown>[] };
    pricing.lines.push({
      productId: 'g',
      quantity: 1,
      unitEgp: 0,
      name: 'Socks',
      gift: { giftName: 'Free socks' },
    });
    const email = renderOrderEmail('cod-placed', read(doc), full);
    assert.ok(email.html.includes('>FREE GIFT<'));
    assert.ok(email.text.includes('Free socks: Socks (Qty 1): Free'));
  });

  it('never shows two Message Us on WhatsApp buttons', () => {
    // No InstaPay details: the main button is Message Us on WhatsApp, so the footer skips its own.
    const email = renderOrderEmail('instapay-placed', read(orderDoc({ paymentMethod: 'instapay' })), {
      ...ctx,
      whatsappNumber: WA,
    });
    assert.equal(email.html.split('>Message Us on WhatsApp<').length - 1, 1);
  });

  it('a cash on delivery fee that paymentDue() cannot read is never called free', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({ country: 'GB' })), full);
    assert.doesNotMatch(email.text, /Shipping is free/);
  });

  it('leaves every WhatsApp button out when no number is set', () => {
    for (const [kind, doc] of kinds) {
      const email = renderOrderEmail(kind, read(doc), { ...ctx, instapay: INSTAPAY, bankTransfer: BANK });
      assert.ok(!email.html.includes('wa.me'), kind);
      assert.ok(!email.html.includes('Message Us on WhatsApp'), kind);
    }
  });

  it('payment failed: charged nothing, Shop Again, and the WhatsApp help line for paying', () => {
    const email = renderOrderEmail(
      'payment-failed',
      read(orderDoc({ paymentMethod: 'paymob', status: 'failed' })),
      full,
    );
    assert.ok(email.text.includes(`Charged: ${formatEgp(0)}`));
    assert.match(email.text, /Still Want These\?/);
    assert.match(email.text, /Trouble paying\? We can help on WhatsApp\./);
  });
});

describe('Bold Black staff alert (<KEY>-222)', () => {
  const BANK = {
    accountName: 'Atteya Store',
    bankName: 'National Bank of Egypt',
    iban: 'EG520003023350016856630000150',
    swift: 'NBEGEGCXXXX',
  };
  const full: OrderEmailContext = { ...withPay, bankTransfer: BANK };
  const alert = (doc: Record<string, unknown>, context: OrderEmailContext = full) =>
    renderOrderEmail('store-new-order', read(doc), context);
  const bank = () =>
    orderDoc({ paymentMethod: 'bank-transfer', country: 'US', payIn: { currency: 'USD', amount: 205 } });
  const cases = {
    codPaid: orderDoc({}),
    codFree: orderDoc({ shippingEgp: 0 }),
    instapay: orderDoc({ paymentMethod: 'instapay' }),
    bank: bank(),
    card: orderDoc({ paymentMethod: 'paymob', status: 'confirmed' }),
    large: orderDoc({ feeAgreed: false }),
    review: orderDoc({ paymentMethod: 'paymob', status: 'confirmed', needsReview: true }),
  };

  it('renders every case with the black header, STAFF tag, footer and email-safe HTML', () => {
    for (const [name, doc] of Object.entries(cases)) {
      const email = alert(doc);
      assert.ok(email.html.includes('ATTEYA STORE'), name);
      assert.ok(email.html.includes('>STAFF<'), name);
      assert.ok(email.html.includes('Sent to the store team for every new order.'), name);
      assert.ok(email.text.includes('Sent to the store team for every new order.'), name);
      assert.ok(email.html.includes('>Pack List<'), name);
      assert.ok(email.html.includes('border-top:3px solid #111111'), name);
      assert.ok(email.html.includes('href="https://shop.example/admin/orders/abcdef123456"'), name);
      assert.ok(email.text.includes('Open This Order: https://shop.example/admin/orders/abcdef123456'), name);
      assert.doesNotMatch(email.html, /display:\s*(flex|grid)|position:\s*(absolute|relative|fixed)/, name);
      assert.doesNotMatch(email.html, /<button/, name);
      assert.ok(email.html.includes('max-width:600px'), name);
      assert.ok(email.text.endsWith('\n'), name);
    }
  });

  it('keeps the subject lines as before', () => {
    assert.equal(alert(cases.codPaid).subject, `New Order #ABCDEF – ${formatEgp(2450)} – Cash on Delivery`);
    assert.equal(
      alert(cases.instapay).subject,
      `New Order #ABCDEF – ${formatEgp(2450)} – InstaPay – Waiting for Transfer`,
    );
    assert.equal(
      alert(cases.bank).subject,
      `New Order #ABCDEF – $205 (${formatEgp(2450)}) – Bank Transfer – Waiting for Transfer`,
    );
    assert.equal(alert(cases.card).subject, `New Order #ABCDEF – ${formatEgp(2450)} – Paid Online`);
    assert.equal(
      alert(cases.large).subject,
      `New Order #ABCDEF – ${formatEgp(2370)} + Delivery – Agree Delivery Fee`,
    );
  });

  it('header: date and time in Cairo, the total and the ref with the method', () => {
    const doc = orderDoc({});
    // 12:32 UTC on 12 Nov 2026 is 14:32 in Cairo.
    doc['createdAt'] = Date.UTC(2026, 10, 12, 12, 32);
    const email = alert(doc);
    assert.ok(email.html.includes('>NEW ORDER · 12 NOV · 14:32<'));
    assert.ok(email.html.includes(`>${formatEgp(2450)}</h1>`));
    assert.ok(email.html.includes('>#ABCDEF · Cash on Delivery<'));
    assert.ok(
      email.text.startsWith(`New Order · 12 Nov · 14:32\n${formatEgp(2450)}\n#ABCDEF · Cash on Delivery`),
    );
  });

  it('Cash on Delivery with a fee: three amounts and the InstaPay next step', () => {
    const email = alert(cases.codPaid);
    assert.ok(email.html.includes('>FEE BY INSTAPAY<'));
    assert.ok(email.html.includes('>CASH AT DOOR<'));
    assert.ok(email.text.includes(`Next Step: Wait for ${formatEgp(80)} on InstaPay`));
    assert.ok(email.text.includes('Send the order once the shipping fee arrives on InstaPay.'));
  });

  it('Cash on Delivery with free shipping: Free, and no next-step box', () => {
    const email = alert(cases.codFree);
    assert.ok(email.text.includes('Fee by InstaPay: Free'));
    assert.ok(!email.text.includes('Next Step'));
    assert.ok(!email.html.includes('>1</td>'), 'no number circle');
  });

  it('InstaPay: waiting for the transfer', () => {
    const email = alert(cases.instapay);
    assert.ok(email.html.includes('>WAITING FOR TRANSFER<'));
    assert.match(email.text, /once you see it in your bank app/);
  });

  it('Bank Transfer: the amount sent is the big number, the EGP total under it', () => {
    const email = alert(cases.bank);
    assert.ok(email.html.includes('>$205</h1>'));
    assert.ok(email.html.includes(`${formatEgp(2450)} order total`));
    assert.ok(email.html.includes('>CUSTOMER SENDS<'));
    assert.ok(email.html.includes('>ORDER TOTAL IN EGP<'));
    assert.ok(email.text.includes('United States'), 'country on the address line');
  });

  it('Card: paid, no next-step box', () => {
    const email = alert(cases.card);
    assert.ok(email.text.includes(`Paid: ${formatEgp(2450)}`));
    assert.ok(!email.text.includes('Next Step'));
  });

  it('large order: the header asks to agree the fee and the strip says Not Set Yet', () => {
    const email = alert(cases.large);
    assert.ok(email.html.includes('>AGREE THE DELIVERY FEE<'));
    assert.ok(email.html.includes(`>${formatEgp(2370)} + Delivery</h1>`));
    assert.ok(email.text.includes('Delivery Fee: Not Set Yet'));
    assert.ok(email.text.includes('Next Step: Agree the delivery fee on WhatsApp'));
    // The note is said once, in the header.
    assert.equal(email.html.split('heavier than the biggest box').length - 1, 1);
  });

  it('needs a look: the header becomes the warning', () => {
    const email = alert(cases.review);
    assert.ok(email.html.includes('>CHECK THIS ORDER<'));
    assert.ok(email.html.includes('One item sold out before this payment came in. Please check this order.'));
    assert.ok(!email.html.includes('NEW ORDER ·'));
  });

  it('customer block: phone link, email, guest or account, the box and the WhatsApp button', () => {
    const guest = alert(cases.codPaid);
    assert.ok(guest.html.includes('href="tel:01012345678"'));
    assert.ok(guest.html.includes('shopper@example.com'));
    assert.ok(guest.text.includes('12 Nile St, Cairo · Guest checkout · Box 1'));
    assert.ok(guest.html.includes('>Message Customer on WhatsApp<'));
    assert.ok(guest.html.includes('href="https://wa.me/201012345678?text='));

    const signedIn = orderDoc({});
    signedIn['customerId'] = 'uid-1';
    assert.ok(alert(signedIn).text.includes('12 Nile St, Cairo · Account · Box 1'));

    const noNumber = orderDoc({});
    (noNumber['shipping'] as Record<string, unknown>)['phone'] = '123';
    assert.ok(!alert(noNumber).html.includes('Message Customer on WhatsApp'));
  });

  it('item grid columns share the gaps so every column is the same width', () => {
    const email = alert(cases.codPaid);
    assert.ok(email.html.includes('width="50%" valign="top" style="padding-right:8px;'));
    assert.ok(email.html.includes('width="50%" valign="top" style="padding-left:8px;'));
  });

  it('Pack List: 2 per row with ×n tags, gifts sit under their item, 5 or more items are a compact list', () => {
    const doc = orderDoc({});
    const pricing = doc['pricing'] as { lines: Record<string, unknown>[] };
    pricing.lines.push({
      productId: 'g',
      quantity: 1,
      unitEgp: 0,
      name: 'Socks',
      gift: { giftName: 'Free socks' },
    });
    const email = alert(doc);
    assert.ok(email.html.includes('>×2<'));
    assert.ok(email.html.includes('?tr=w-520,'), '2 per row photos');
    assert.ok(email.text.includes('- ×1 Socks: Free socks'));
    assert.ok(email.html.includes('>FREE GIFT<'));
    assert.ok(email.html.includes('Free socks · ×1'), 'gift strip under its item');
    assert.ok(email.text.includes('Items: 3'));

    const many = orderDoc({});
    const manyPricing = many['pricing'] as { lines: Record<string, unknown>[] };
    const base = manyPricing.lines[0]!;
    manyPricing.lines = Array.from({ length: 5 }, (_, i) => ({ ...base, productId: `p${i}`, quantity: 1 }));
    assert.ok(alert(many).html.includes('width="64"'), 'compact list');
    manyPricing.lines = manyPricing.lines.slice(0, 4);
    assert.ok(!alert(many).html.includes('width="64"'));
  });

  it('leaves links out when the storefront address is not set', () => {
    const email = alert(cases.codPaid, { ...full, storefrontUrl: '' });
    assert.ok(!email.html.includes('Open This Order'));
  });
});
