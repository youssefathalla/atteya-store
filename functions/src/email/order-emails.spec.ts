import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orderEmailsForWrite } from './order-email-events.js';
import { readOrderForEmail, shortOrderRef, type OrderEmailOrder } from './order-email-model.js';
import { formatEgp, renderOrderEmail, type OrderEmailContext } from './order-email-templates.js';

const ctx: OrderEmailContext = {
  storefrontUrl: 'https://shop.example',
  imageBaseUrl: 'https://ik.imagekit.io/atteyastore/dev',
  canReply: true,
  storeName: 'Atteya Store',
  whatsappNumber: '',
};

function orderDoc(overrides: {
  status?: string;
  paymentMethod?: string;
  subtotalEgp?: number;
  shippingEgp?: number;
  country?: string;
  needsReview?: boolean;
  email?: string | null;
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
      shipping: { kind: 'domestic-box', boxId: 'box1', priceEgp: shipping, priceDisplay: shipping },
      totalEgp: subtotal + shipping,
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

describe('order email wording and amounts', () => {
  it('cash on delivery placed asks for the shipping fee first, then the rest', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.equal(email.subject, 'We got your order #ABCDEF');
    assert.match(email.text, /We'll contact you to confirm it./);
    assert.ok(!/whatsapp/i.test(email.text + email.html), 'no WhatsApp mention');
    assert.ok(email.text.includes(`shipping fee of ${formatEgp(80)}`));
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
    assert.ok(!confirmed.text.includes("received your shipping fee"));
    const alert = renderOrderEmail('store-new-order', order, ctx);
    assert.match(alert.text, /No shipping fee to collect/);
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
    assert.ok(email.text.includes('Shop again: https://shop.example/shop'));
    assert.ok(!email.text.toLowerCase().includes('bag'));
  });

  it('store alert: amounts to collect, phone, and the sold-out warning', () => {
    const cod = renderOrderEmail('store-new-order', read(orderDoc({})), ctx);
    assert.equal(cod.subject, `New order #ABCDEF – ${formatEgp(2450)} – Cash on delivery`);
    assert.ok(
      cod.text.includes(
        `Collect the shipping fee of ${formatEgp(80)} first, then ${formatEgp(2370)} on delivery.`,
      ),
    );
    assert.match(cod.text, /01012345678/);

    const paid = renderOrderEmail(
      'store-new-order',
      read(orderDoc({ paymentMethod: 'paymob', status: 'confirmed', needsReview: true })),
      ctx,
    );
    assert.match(paid.subject, /Paid online$/);
    assert.match(paid.text, /sold out before this payment/);
  });

  it('escapes product names and builds photo links', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), ctx);
    assert.ok(email.html.includes('Padel Racket &lt;Pro&gt;'));
    assert.ok(!email.html.includes('<Pro>'));
    assert.ok(
      email.html.includes('https://ik.imagekit.io/atteyastore/dev/products/p1/a%20b.jpg?tr='),
    );
  });

  it('skips orders without an email address for the shopper', () => {
    const order = read(orderDoc({ email: null }));
    assert.equal(order.customerEmail, null);
  });
});

describe('order email photos', () => {
  it('leaves out the photo column when an item has no photo', () => {
    const doc = orderDoc({});
    const pricing = doc['pricing'] as { lines: Record<string, unknown>[] };
    pricing.lines[0]!['imagePath'] = null;
    const email = renderOrderEmail('cod-placed', read(doc), ctx);
    assert.ok(!email.html.includes('<img'));
    assert.ok(!email.html.includes('width="72"'));
    assert.ok(email.html.includes('colspan="2"'));
  });
});

describe('order email help line', () => {
  it('shows the business WhatsApp number with a chat link when set', () => {
    const email = renderOrderEmail('cod-placed', read(orderDoc({})), { ...ctx, whatsappNumber: '+20 120 565 8954' });
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
    const email = renderOrderEmail('store-new-order', read(orderDoc({})), { ...ctx, whatsappNumber: '+20 120 565 8954' });
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
