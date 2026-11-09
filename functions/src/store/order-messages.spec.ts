import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cashOnDeliveryEgp,
  isDeliveryFeeToBeAgreed,
  isEgyptMobile,
  orderStage,
  paymentDue,
  shopperWhatsappNumber,
  shopperWhatsappText,
  staffWhatsappText,
  type OrderMessageInput,
  type OrderStage,
} from './order-messages.js';
import { whatsappChatUrl } from './store-info.js';

const INSTAPAY = { address: 'atteya@instapay', number: '010 1234 5678' };
const NO_INSTAPAY = { address: '', number: '' };

function order(overrides: Partial<OrderMessageInput> = {}): OrderMessageInput {
  return {
    ref: '#A1B2C3',
    paymentMethod: 'instapay',
    status: 'pending',
    country: 'EG',
    shippingEgp: 120,
    totalEgp: 1500,
    needsReview: false,
    ...overrides,
  };
}

/** Large Egypt order whose delivery fee isn't agreed yet: neither amount is known. */
const TO_AGREE = { shippingEgp: null, totalEgp: null, feeToBeAgreed: true } as const;

const ALL_STAGES: readonly [OrderStage, OrderMessageInput][] = [
  ['fee-to-be-agreed', order(TO_AGREE)],
  ['fee-to-be-agreed', order({ paymentMethod: 'cash-on-delivery', ...TO_AGREE })],
  ['instapay-total-due', order()],
  ['instapay-fee-due', order({ paymentMethod: 'cash-on-delivery' })],
  ['cod-free-pending', order({ paymentMethod: 'cash-on-delivery', shippingEgp: 0, totalEgp: 1380 })],
  ['cod-confirmed', order({ paymentMethod: 'cash-on-delivery', status: 'confirmed' })],
  ['paid', order({ status: 'confirmed' })],
  ['paid', order({ paymentMethod: 'paymob', status: 'confirmed', country: 'AE' })],
  ['paid-needs-review', order({ paymentMethod: 'paymob', status: 'confirmed', needsReview: true })],
  ['paymob-pending', order({ paymentMethod: 'paymob' })],
  ['failed', order({ paymentMethod: 'paymob', status: 'failed' })],
  ['cancelled', order({ status: 'cancelled' })],
  ['unknown', order({ paymentMethod: 'international-bank-transfer' })],
];

describe('orderStage', () => {
  for (const [stage, input] of ALL_STAGES) {
    it(`${input.paymentMethod} ${input.status} ${input.country} -> ${stage}`, () => {
      assert.equal(orderStage(input), stage);
    });
  }

  it('never asks for an InstaPay or cash-on-delivery payment outside Egypt', () => {
    assert.equal(orderStage(order({ country: 'AE' })), 'unknown');
    assert.equal(orderStage(order({ paymentMethod: 'cash-on-delivery', country: 'GB' })), 'unknown');
  });

  it('does not guess free shipping when the saved fee is unreadable', () => {
    assert.equal(orderStage(order({ paymentMethod: 'cash-on-delivery', shippingEgp: null })), 'unknown');
  });
});

describe('delivery fee to be agreed', () => {
  it('reads the saved shipping line', () => {
    assert.equal(isDeliveryFeeToBeAgreed({ kind: 'domestic-agreed', feeAgreed: false }), true);
    assert.equal(isDeliveryFeeToBeAgreed({ kind: 'domestic-agreed' }), true);
    assert.equal(isDeliveryFeeToBeAgreed({ kind: 'domestic-agreed', feeAgreed: true }), false);
    assert.equal(isDeliveryFeeToBeAgreed({ kind: 'domestic-box', priceEgp: 115 }), false);
    assert.equal(isDeliveryFeeToBeAgreed(null), false);
  });

  it('only applies while the order is open; confirmed and cancelled orders keep their stage', () => {
    assert.equal(orderStage(order({ ...TO_AGREE, status: 'cancelled' })), 'cancelled');
    assert.equal(
      orderStage(
        order({ paymentMethod: 'cash-on-delivery', status: 'confirmed', shippingEgp: 200, totalEgp: 2200 }),
      ),
      'cod-confirmed',
    );
  });

  it('asks for nothing and mentions no InstaPay until the fee is set', () => {
    const input = order({ paymentMethod: 'cash-on-delivery', ...TO_AGREE });
    assert.equal(paymentDue(orderStage(input), input), null);
    assert.equal(cashOnDeliveryEgp(input), null);
    assert.equal(
      shopperWhatsappText('fee-to-be-agreed', input, INSTAPAY),
      'مرحباً، طلبي رقم #A1B2C3. عايز أعرف مصاريف الشحن.',
    );
    assert.match(
      staffWhatsappText('fee-to-be-agreed', input, 'Ahmed Ali', INSTAPAY) ?? '',
      /نتفق معاك على مصاريف الشحن/,
    );
  });

  it('once the fee is set the order asks for money as usual', () => {
    const cod = order({ paymentMethod: 'cash-on-delivery', shippingEgp: 200, totalEgp: 2200 });
    assert.deepEqual(paymentDue(orderStage(cod), cod), { amountEgp: 200, reason: 'shipping-fee' });
    const instapay = order({ shippingEgp: 200, totalEgp: 2200 });
    assert.deepEqual(paymentDue(orderStage(instapay), instapay), { amountEgp: 2200, reason: 'total' });
  });
});

describe('paymentDue', () => {
  it('asks for the full total on an open InstaPay order', () => {
    const input = order();
    assert.deepEqual(paymentDue(orderStage(input), input), { amountEgp: 1500, reason: 'total' });
  });

  it('asks only for the shipping fee on open cash on delivery', () => {
    const input = order({ paymentMethod: 'cash-on-delivery' });
    assert.deepEqual(paymentDue(orderStage(input), input), { amountEgp: 120, reason: 'shipping-fee' });
    assert.equal(cashOnDeliveryEgp(input), 1380);
  });

  it('asks for nothing in every other stage', () => {
    for (const [stage, input] of ALL_STAGES) {
      if (stage === 'instapay-total-due' || stage === 'instapay-fee-due') continue;
      assert.equal(paymentDue(stage, input), null, stage);
    }
  });

  it('keeps the request but drops an unreadable amount', () => {
    const input = order({ totalEgp: null });
    assert.deepEqual(paymentDue(orderStage(input), input), { amountEgp: null, reason: 'total' });
  });
});

describe('WhatsApp texts', () => {
  it('only the two "due" stages mention InstaPay or a screenshot', () => {
    for (const [stage, input] of ALL_STAGES) {
      const due = stage === 'instapay-total-due' || stage === 'instapay-fee-due';
      for (const text of [
        shopperWhatsappText(stage, input, INSTAPAY),
        staffWhatsappText(stage, input, 'Ahmed Ali', INSTAPAY),
      ]) {
        if (text === null) continue;
        assert.equal(/InstaPay|صورة التحويل/.test(text), due, `${stage}: ${text}`);
      }
    }
  });

  it('shopper text for an InstaPay order has the order number and total in English digits', () => {
    const text = shopperWhatsappText('instapay-total-due', order(), INSTAPAY);
    assert.equal(text, 'مرحباً، طلبي رقم #A1B2C3. حوّلت 1,500 EGP على InstaPay، ودي صورة التحويل.');
  });

  it('shopper text for cash on delivery names the shipping fee', () => {
    const input = order({ paymentMethod: 'cash-on-delivery' });
    const text = shopperWhatsappText('instapay-fee-due', input, INSTAPAY) ?? '';
    assert.match(text, /مصاريف الشحن 120 EGP/);
    assert.doesNotMatch(text, /1,500/);
  });

  it('shopper asks for the InstaPay details when none are set yet', () => {
    const text = shopperWhatsappText('instapay-total-due', order(), NO_INSTAPAY) ?? '';
    assert.match(text, /محتاج بيانات InstaPay/);
    assert.doesNotMatch(text, /صورة التحويل/);
  });

  it('no shopper button while a card payment is still being confirmed', () => {
    assert.equal(shopperWhatsappText('paymob-pending', order({ paymentMethod: 'paymob' })), null);
  });

  it('staff deposit message has the fee, the InstaPay details and the cash amount', () => {
    const input = order({ paymentMethod: 'cash-on-delivery' });
    const text = staffWhatsappText('instapay-fee-due', input, 'Ahmed Ali', INSTAPAY) ?? '';
    assert.match(text, /أهلاً Ahmed/);
    assert.match(text, /#A1B2C3/);
    assert.match(text, /120 EGP/);
    assert.match(text, /atteya@instapay/);
    assert.match(text, /010 1234 5678/);
    assert.match(text, /1,380 EGP/);
  });

  it('staff message for a paid order confirms without amounts', () => {
    const input = order({ paymentMethod: 'paymob', status: 'confirmed', country: 'AE' });
    const text = staffWhatsappText('paid', input, 'Sara', INSTAPAY) ?? '';
    assert.match(text, /بالكامل/);
    assert.doesNotMatch(text, /EGP|InstaPay|كاش/);
  });

  it('staff get only a greeting when an item ran short, failed or was cancelled', () => {
    for (const stage of ['paid-needs-review', 'failed', 'cancelled'] as const) {
      const text = staffWhatsappText(stage, order(), 'Sara', INSTAPAY) ?? '';
      assert.equal(text.includes('\n'), false, stage);
      assert.match(text, /#A1B2C3/);
    }
  });

  it('no staff button while a card payment is pending or the order is unknown', () => {
    assert.equal(staffWhatsappText('paymob-pending', order(), 'Sara'), null);
    assert.equal(staffWhatsappText('unknown', order(), 'Sara'), null);
  });

  it('free-shipping cash on delivery asks for nothing now', () => {
    const input = order({ paymentMethod: 'cash-on-delivery', shippingEgp: 0, totalEgp: 1380 });
    const text = staffWhatsappText('cod-free-pending', input, 'Sara', INSTAPAY) ?? '';
    assert.match(text, /الشحن مجاني/);
    assert.match(text, /1,380 EGP/);
  });

  it('builds a wa.me link with the message already written', () => {
    const url = whatsappChatUrl('+20 120 565 8954', 'مرحباً #A1B2C3') ?? '';
    assert.ok(url.startsWith('https://wa.me/201205658954?text='));
    assert.equal(decodeURIComponent(url.split('?text=')[1] ?? ''), 'مرحباً #A1B2C3');
    assert.equal(whatsappChatUrl('+20 120 565 8954'), 'https://wa.me/201205658954');
  });
});

describe('shopperWhatsappNumber', () => {
  it('turns Egyptian mobiles into international digits', () => {
    assert.equal(shopperWhatsappNumber('010 1234 5678', 'EG'), '201012345678');
    assert.equal(shopperWhatsappNumber('01512345678', 'EG'), '201512345678');
    assert.equal(shopperWhatsappNumber('+20 101 234 5678', 'EG'), '201012345678');
    assert.equal(shopperWhatsappNumber('0020 1012345678', 'EG'), '201012345678');
    assert.equal(shopperWhatsappNumber('201012345678', 'EG'), '201012345678');
    assert.equal(shopperWhatsappNumber('1012345678', 'EG'), '201012345678');
  });

  it('refuses Egyptian landlines and short numbers', () => {
    assert.equal(shopperWhatsappNumber('02 2345 6789', 'EG'), null);
    assert.equal(shopperWhatsappNumber('0101234', 'EG'), null);
    assert.equal(isEgyptMobile('02 2345 6789'), false);
    assert.equal(isEgyptMobile('010 1234 5678'), true);
  });

  it('keeps numbers typed with a country code abroad', () => {
    assert.equal(shopperWhatsappNumber('+971 50 123 4567', 'AE'), '971501234567');
    assert.equal(shopperWhatsappNumber('00971501234567', 'AE'), '971501234567');
  });

  it('adds the country code only after a local leading 0', () => {
    assert.equal(shopperWhatsappNumber('050 123 4567', 'AE'), '971501234567');
    assert.equal(shopperWhatsappNumber('07700 900123', 'GB'), '447700900123');
  });

  it('gives up on numbers it cannot place safely', () => {
    assert.equal(shopperWhatsappNumber('501234567', 'AE'), null);
    assert.equal(shopperWhatsappNumber('0501234567', 'ZZ'), null);
    assert.equal(shopperWhatsappNumber('', 'EG'), null);
  });
});
