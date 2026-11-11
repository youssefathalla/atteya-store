import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimId, orderEmailsForWrite } from './order-email-events.js';
import {
  orderConfirmationUrl,
  readOrderForEmail,
  shortOrderRef,
  type OrderEmailOrder,
} from './order-email-model.js';
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
    assert.match(cod.text, /in cash ready/);
    const card = renderOrderEmail(
      'order-shipped',
      read(orderDoc({ paymentMethod: 'paymob', status: 'shipped' })),
      ctx,
    );
    assert.doesNotMatch(card.text, /in cash/);
    const guest = renderOrderEmail(
      'order-delivered',
      read({ ...orderDoc({ status: 'delivered' }), viewKey: 'k'.repeat(43) }),
      ctx,
    );
    assert.match(guest.subject, /was delivered/);
    assert.match(guest.html, /\?key=k{43}/);
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
    assert.ok(email.text.includes(`Pay ${formatEgp(2450)} by InstaPay to:`));
    assert.ok(email.text.includes('InstaPay address: atteya@instapay'));
    assert.ok(email.text.includes('InstaPay number: 010 1234 5678'));
    assert.ok(email.text.includes('Then send us a screenshot of the transfer.'));
    assert.ok(email.text.includes('Send on WhatsApp: https://wa.me/201205658954?text='));
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
    assert.ok(email.text.includes(`Pay the ${formatEgp(80)} shipping fee by InstaPay to:`));
    assert.ok(!email.text.includes(`Pay ${formatEgp(2450)}`));
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
    assert.ok(paid.text.includes(`InstaPay payment of ${formatEgp(2450)}`));
  });

  it('store alert says InstaPay is waiting for the transfer', () => {
    const email = renderOrderEmail('store-new-order', read(orderDoc({ paymentMethod: 'instapay' })), ctx);
    assert.match(email.subject, /InstaPay – Waiting for Transfer/);
    assert.ok(email.text.includes(`InstaPay\nWaiting for Transfer: ${formatEgp(2450)}`));
    assert.match(email.text, /once you see it in your bank app/);
  });
});

describe('order email wording and amounts', () => {
  it('cash on delivery placed asks for the shipping fee first, then the rest', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.equal(email.subject, 'We got your order #ABCDEF');
    assert.match(email.text, /We've received your order #ABCDEF./);
    assert.ok(!/whatsapp/i.test(email.text + email.html), 'no WhatsApp mention');
    assert.ok(email.text.includes(`the ${formatEgp(80)} shipping fee`));
    assert.ok(email.text.includes(`the rest, ${formatEgp(2370)}, in cash`));
    assert.ok(email.text.includes(`Total: ${formatEgp(2450)}`));
    assert.ok(!email.text.includes('01012345678'), 'shopper emails never repeat the phone');
  });

  it('cash on delivery with free shipping has no deposit', () => {
    const order = read(orderDoc({ shippingEgp: 0 }));
    const placed = renderOrderEmail('cod-placed', order, ctx);
    assert.match(placed.text, /Shipping is free on this order, so there's nothing to pay now/);
    assert.ok(placed.text.includes('Shipping: Free'));
    assert.ok(!placed.text.includes('shipping fee of'));
    const confirmed = renderOrderEmail('cod-confirmed', order, ctx);
    assert.ok(!confirmed.text.includes('received your shipping fee'));
    const alert = renderOrderEmail('store-new-order', order, ctx);
    assert.ok(alert.text.includes(`Shipping Fee: Free\nCash at the Door: ${formatEgp(2370)}`));
    assert.ok(!alert.text.includes('arrives on InstaPay'), 'no fee to wait for');
  });

  it('cash on delivery confirmed: fee received, cash amount is total minus shipping', () => {
    const email = renderOrderEmail('cod-confirmed', read(orderDoc({ status: 'confirmed' })), ctx);
    assert.match(email.text, /received your shipping fee/);
    assert.ok(email.text.includes(`have ${formatEgp(2370)} in cash ready`));
  });

  it('paid online: full total, EGP note only abroad', () => {
    const egypt = renderOrderEmail(
      'paid-confirmed',
      read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed' })),
      ctx,
    );
    assert.ok(egypt.text.includes(`payment of ${formatEgp(2450)}`));
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
      cod.text.includes(
        `Cash on Delivery\nShipping Fee: ${formatEgp(80)}\nCash at the Door: ${formatEgp(2370)}`,
      ),
    );
    assert.match(cod.text, /Customer:\n.+\n01012345678\n/);
    assert.ok(cod.html.includes('<strong>Customer</strong><br>'));
    assert.ok(!cod.html.includes(' · 01012345678'), 'customer details are one per line');
    assert.ok(cod.html.includes('background:#e8e8e8'), 'dashboard button is tonal');

    const paid = renderOrderEmail(
      'store-new-order',
      read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed', needsReview: true })),
      ctx,
    );
    assert.match(paid.subject, /Paid Online$/);
    assert.ok(paid.text.includes(`Card\nPaid: ${formatEgp(2450)}`));
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

  it('shows each item as a card with its quantity and price, and counts every unit', () => {
    const email = renderOrderEmail('store-new-order', read(orderDoc({})), ctx);
    assert.match(email.html, /ITEMS \(\d+\)/);
    assert.ok(email.html.includes('Qty '));
    assert.ok(email.html.includes('background:#fafafa'), 'quantity and price strip');
    assert.ok(email.html.includes('View Your Order') || email.html.includes('Open Orders in the Dashboard'));
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
    assert.ok(email.html.includes('>1 free<'));
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
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), {
      ...ctx,
      whatsappNumber: '+20 120 565 8954',
    });
    assert.ok(email.text.includes('Questions? Message us on WhatsApp: +20 120 565 8954'));
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
      assert.match(email.text, /Shipping: We'll contact you/);
      assert.doesNotMatch(email.text, /atteya@instapay|screenshot/);
    }
  });

  it('store alert asks staff to agree the fee', () => {
    const email = renderOrderEmail('store-new-order', placed, withPay);
    assert.match(email.subject, /Agree Delivery Fee/);
    assert.match(email.text, /Delivery Fee: To Be Agreed/);
  });

  it('fee-set email shows the fee and the InstaPay box for it', () => {
    const email = renderOrderEmail('delivery-fee-set', set, withPay);
    assert.match(email.text, new RegExp(`delivery fee for your order #ABCDEF is ${formatEgp(250)}`));
    assert.match(email.text, /atteya@instapay/);
    assert.match(email.text, new RegExp(`the ${formatEgp(250)} shipping fee`));
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
    assert.match(email.text, /Send \$205 from your bank to:/);
    assert.match(email.text, /IBAN: EG52 0003 0233 5001 6856 6300 0015 0/);
    assert.match(email.text, /SWIFT \/ BIC: NBEGEGCXXXX/);
    assert.match(email.text, /Bank: National Bank of Egypt/);
    assert.match(email.text, /Account name: Youseif Tamer Elsayed Ibrahim Atteya/);
    assert.match(email.text, /Reference: ABCDEF/);
    assert.match(email.text, /Choose "I pay all fees" so the full amount reaches us\./);
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
    assert.match(email.text, /bank transfer of \$205/);
    assert.doesNotMatch(email.text, /IBAN|Send Receipt/);
  });

  it('store alert shows the method, the amount in the shopper currency and the EGP total', () => {
    const email = renderOrderEmail('store-new-order', read(bankDoc()), withBank);
    assert.match(email.subject, /Bank Transfer – Waiting for Transfer/);
    assert.match(email.text, /Bank Transfer\nCustomer Sends: \$205\nOrder Total in EGP: /);
    assert.ok(email.text.includes(formatEgp(2450)));
  });
});
