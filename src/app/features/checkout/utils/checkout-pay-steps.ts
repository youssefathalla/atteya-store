/** One step of "how to pay" under the chosen payment method at checkout. */
export interface PayStep {
  readonly title: string;
  readonly note: string;
  /** What this step costs ("EGP 115"), or null when nothing is paid in it. */
  readonly amount: string | null;
}

/** The amounts checkout already worked out for the bag (`readySummary()`). */
export interface PayStepAmounts {
  readonly feeToBeAgreed: boolean;
  readonly instapayTotal: string;
  readonly codShipping: string;
  readonly codShippingEgp: number;
  readonly codCash: string;
}

/** What a Bank Transfer sends: the total in the currency checkout shows. */
export interface BankTransferAmounts {
  /** The total as checkout shows it ("$205"), or null when it can't be shown in a foreign currency. */
  readonly total: string | null;
  /** The currency's name in the plural, "US dollars". */
  readonly currencyName: string;
}

const PLACE: PayStep = { title: 'Place your order', note: 'Nothing to pay yet', amount: null };
const AGREE_FEE: PayStep = {
  title: "We'll contact you about the delivery fee",
  note: 'On WhatsApp, after you place your order',
  amount: null,
};

/** InstaPay: place the order, send the total, send the screenshot. */
export function instapaySteps(a: PayStepAmounts): PayStep[] {
  if (a.feeToBeAgreed) {
    return [
      PLACE,
      AGREE_FEE,
      { title: 'Send the total by InstaPay', note: 'Once the fee is agreed', amount: null },
      { title: 'Send the screenshot on WhatsApp', note: 'We confirm and ship', amount: null },
    ];
  }
  return [
    PLACE,
    { title: 'Send the total by InstaPay', note: 'From your InstaPay app', amount: a.instapayTotal },
    { title: 'Send the screenshot on WhatsApp', note: 'We confirm and ship', amount: null },
  ];
}

/** Bank Transfer (outside Egypt): place the order, send the total from your bank, send the receipt. */
export function bankTransferSteps(a: BankTransferAmounts): PayStep[] {
  return [
    PLACE,
    { title: 'Send the total from your bank', note: `In ${a.currencyName}, to our IBAN`, amount: a.total },
    { title: 'Send the receipt on WhatsApp', note: 'We confirm and ship', amount: null },
  ];
}

/**
 * "US dollars", "euros": a currency's name as it reads after "In …", from the browser's own names.
 * Falls back to the code.
 */
export function currencyPluralName(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'name',
    }).formatToParts(2);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

/** Cash on Delivery: the delivery fee by InstaPay first (when there is one), the rest in cash at the door. */
export function cashOnDeliverySteps(a: PayStepAmounts): PayStep[] {
  const rest: PayStep = {
    title: 'Pay the rest in cash at your door',
    note: 'When your order arrives',
    amount: a.codCash,
  };
  if (a.feeToBeAgreed) {
    return [
      PLACE,
      AGREE_FEE,
      { title: 'Send the fee by InstaPay', note: 'Then send the screenshot on WhatsApp', amount: null },
      rest,
    ];
  }
  if (a.codShippingEgp > 0) {
    return [
      PLACE,
      {
        title: 'Send the delivery fee by InstaPay',
        note: 'Then send the screenshot on WhatsApp',
        amount: a.codShipping,
      },
      rest,
    ];
  }
  return [PLACE, { ...rest, title: 'Pay in cash at your door' }];
}
