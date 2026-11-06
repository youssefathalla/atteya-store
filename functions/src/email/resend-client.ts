/**
 * Minimal Resend client over fetch (no SDK dependency).
 * https://resend.com/docs/api-reference/emails/send-email
 */

export interface ResendMessage {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly replyTo?: string;
  /** Resend drops a repeat send with the same key within 24 hours. */
  readonly idempotencyKey: string;
}

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/** Returns the Resend email id. Throws with a short reason on any failure. */
export async function sendResendEmail(apiKey: string, message: ResendMessage): Promise<string> {
  const body: Record<string, unknown> = {
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  if (message.replyTo) body['reply_to'] = message.replyTo;

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const reason =
      payload && typeof payload['message'] === 'string' ? payload['message'] : response.statusText;
    throw new Error(`Resend ${response.status}: ${reason}`.slice(0, 300));
  }
  const id = payload && typeof payload['id'] === 'string' ? payload['id'] : '';
  return id;
}
