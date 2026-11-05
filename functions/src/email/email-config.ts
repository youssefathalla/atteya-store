import { defineSecret, defineString } from 'firebase-functions/params';

/** Resend API key. Never commit; set with `firebase functions:secrets:set RESEND_API_KEY`. */
export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

/**
 * Sender shown on order emails, e.g. `Atteya Store <orders@example.com>`.
 * The domain must be verified in Resend. Until then the Resend test sender
 * works, but it only delivers to the Resend account owner's address.
 */
export const RESEND_FROM = defineString('RESEND_FROM', {
  default: 'Atteya Store <onboarding@resend.dev>',
  description: 'From address for order emails (domain verified in Resend).',
});

/** Where shopper replies go. Empty = replies go to the From address. */
export const RESEND_REPLY_TO = defineString('RESEND_REPLY_TO', {
  default: '',
  description: 'Reply-To address for order emails (optional).',
});

/**
 * Business WhatsApp number shown in shopper emails ("Questions? Message us on WhatsApp"),
 * written as people should read it, e.g. `+20 120 565 8954`. Empty = no WhatsApp line.
 */
export const STORE_WHATSAPP_NUMBER = defineString('STORE_WHATSAPP_NUMBER', {
  default: '',
  description: 'Business WhatsApp number for shopper emails (international format).',
});

/** Store-owner inbox for new-order alerts. Empty turns the alert off. */
export const STORE_ALERT_EMAIL = defineString('STORE_ALERT_EMAIL', {
  default: '',
  description: 'Inbox that receives new-order alerts (empty = no alert).',
});
