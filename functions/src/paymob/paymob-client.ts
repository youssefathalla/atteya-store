export interface PaymobBillingData {
  readonly first_name: string;
  readonly last_name: string;
  readonly phone_number: string;
  readonly email: string;
  readonly street: string;
  readonly building: string;
  readonly floor: string;
  readonly apartment: string;
  readonly city: string;
  readonly country: string;
  readonly state: string;
}

export interface PaymobIntentionItem {
  readonly name: string;
  readonly amount: number;
  readonly description?: string;
  readonly quantity: number;
}

export interface CreatePaymobIntentionInput {
  readonly baseUrl: string;
  readonly secretKey: string;
  readonly amountCents: number;
  readonly currency: 'EGP';
  readonly integrationIds: readonly number[];
  readonly billingData: PaymobBillingData;
  readonly items: readonly PaymobIntentionItem[];
  readonly specialReference: string;
  readonly notificationUrl: string;
  readonly redirectionUrl: string;
  readonly expirationSeconds?: number;
}

export interface PaymobIntentionResult {
  readonly id: string;
  readonly clientSecret: string;
  readonly intentionOrderId: number | null;
}

export function buildUnifiedCheckoutUrl(
  baseUrl: string,
  publicKey: string,
  clientSecret: string,
): string {
  const origin = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    publicKey,
    clientSecret,
  });
  return `${origin}/unifiedcheckout/?${params.toString()}`;
}

export async function createPaymobIntention(
  input: CreatePaymobIntentionInput,
): Promise<PaymobIntentionResult> {
  const body = {
    amount: input.amountCents,
    currency: input.currency,
    payment_methods: [...input.integrationIds],
    items: input.items.map((item) => ({
      name: item.name.slice(0, 50),
      amount: item.amount,
      description: (item.description ?? item.name).slice(0, 120),
      quantity: item.quantity,
    })),
    billing_data: input.billingData,
    special_reference: input.specialReference,
    notification_url: input.notificationUrl,
    redirection_url: input.redirectionUrl,
    expiration: input.expirationSeconds ?? 3600,
    extras: { merchant_order_id: input.specialReference },
  };

  const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/v1/intention/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${input.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object' && 'detail' in parsed
        ? String((parsed as { detail: unknown }).detail)
        : text.slice(0, 200);
    throw new Error(`Paymob Intention failed (${response.status}): ${detail || 'unknown error'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Paymob Intention returned an empty body.');
  }
  const data = parsed as Record<string, unknown>;
  const id = typeof data['id'] === 'string' ? data['id'] : null;
  const clientSecret =
    typeof data['client_secret'] === 'string' ? data['client_secret'] : null;
  if (!id || !clientSecret) {
    throw new Error('Paymob Intention response missing id or client_secret.');
  }
  const intentionOrderId =
    typeof data['intention_order_id'] === 'number' ? data['intention_order_id'] : null;

  return { id, clientSecret, intentionOrderId };
}

/** Split a full name into first / last for Paymob billing_data. */
export function splitPersonName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const space = trimmed.indexOf(' ');
  if (space <= 0) return { first: trimmed || 'Customer', last: 'Customer' };
  return {
    first: trimmed.slice(0, space) || 'Customer',
    last: trimmed.slice(space + 1) || 'Customer',
  };
}

/** Paymob billing country expects a 3-letter ISO code when possible. */
export function toPaymobCountry(iso2: string): string {
  const map: Record<string, string> = {
    EG: 'EGY',
    SA: 'SAU',
    AE: 'ARE',
    KW: 'KWT',
    QA: 'QAT',
    BH: 'BHR',
    OM: 'OMN',
    JO: 'JOR',
    GB: 'GBR',
    US: 'USA',
    DE: 'DEU',
    FR: 'FRA',
    IT: 'ITA',
    ES: 'ESP',
    NL: 'NLD',
    CA: 'CAN',
    AU: 'AUS',
  };
  return map[iso2] ?? iso2;
}
