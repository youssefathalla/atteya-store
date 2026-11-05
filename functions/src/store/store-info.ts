/**
 * Atteya Store business details: the one place for contact details and social links.
 *
 * Edit ONLY this file (functions/src/store/store-info.ts), then run `npm run sync:engine`,
 * which copies it to src/app/core/config/store-info.ts for the website.
 * `npm run preflight` fails when the two copies differ.
 *
 * An empty string means "not set yet". Emails and pages skip empty fields, so details
 * can be filled in later without code changes elsewhere.
 * Private details (the store-alert inbox, API keys) do NOT belong here: this file is
 * shipped to every visitor's browser.
 */

export interface StoreInfo {
  /** Brand name as shoppers see it. */
  readonly name: string;
  /** Public website origin, e.g. `https://www.atteyastore.com` (no trailing slash). */
  readonly website: string;
  readonly contact: {
    /** Business WhatsApp in international format as people read it, e.g. `+20 120 565 8954`. */
    readonly whatsapp: string;
    /** Phone number for calls, same format. */
    readonly phone: string;
    /** Public support inbox, e.g. `support@atteyastore.com`. */
    readonly email: string;
  };
  readonly address: {
    readonly line1: string;
    readonly city: string;
    readonly country: string;
  };
  /** Full profile URLs (`https://instagram.com/…`). */
  readonly social: {
    readonly instagram: string;
    readonly facebook: string;
    readonly tiktok: string;
    readonly x: string;
    readonly youtube: string;
  };
}

export const STORE_INFO: StoreInfo = {
  name: 'Atteya Store',
  website: '',
  contact: {
    whatsapp: '+20 120 565 8954',
    phone: '',
    email: '',
  },
  address: {
    line1: '',
    city: '',
    country: 'Egypt',
  },
  social: {
    instagram: '',
    facebook: '',
    tiktok: '',
    x: '',
    youtube: '',
  },
};

/** `wa.me` chat link for a number in any readable format, or null when it is not set. */
export function whatsappChatUrl(number: string): string | null {
  const digits = number.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
