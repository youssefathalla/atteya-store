/**
 * Search words saved on each order (`orders/{id}.searchTokens`) so staff can find it on the admin
 * Orders page by the customer's name (Arabic or English), phone, email or order number.
 *
 * Edit only this copy: `npm run sync:engine` copies it to `src/app/core/config/order-search.ts`,
 * because the website must turn what staff type into words the same way.
 */

/** Firestore keeps the list small; a long name or email still fits well under this. */
const MAX_TOKENS = 150;
/** Shortest word piece saved, so "Ah" finds "Ahmed" and "مح" finds "محمد". */
const MIN_PREFIX_LEN = 2;
/** Shortest run of phone digits saved, so the last 4 digits find the order. */
const MIN_PHONE_DIGITS = 4;

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;

/**
 * Lower case, accents and Arabic marks removed, so spellings that differ only there match:
 * أ إ آ → ا, ؤ → و, ئ → ي (NFD splits off the hamza), ة → ه, ى → ي, harakat and tatweel removed,
 * and Arabic-Indic digits become 0–9.
 */
export function normalizeOrderSearchText(text: string): string {
  return text
    .replace(ARABIC_INDIC_DIGITS, (digit) => String((digit.charCodeAt(0) - 0x0660) % 0x90))
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ـ/g, '')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

/** Words of Latin letters, Arabic letters and digits, after `normalizeOrderSearchText()`. */
export function orderSearchWords(text: string): string[] {
  return normalizeOrderSearchText(text)
    .split(/[^a-z0-9ء-ي]+/)
    .filter((word) => word.length > 0);
}

/** "+20 101 234 5678" and "01012345678" both → ["201012345678", "01012345678"]. */
function phoneForms(phone: string): string[] {
  const digits = normalizeOrderSearchText(phone).replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) return [];
  const forms = new Set([digits]);
  if (digits.startsWith('0020')) forms.add(`0${digits.slice(4)}`);
  else if (digits.startsWith('20') && digits.length === 12) forms.add(`0${digits.slice(2)}`);
  return [...forms];
}

function addPrefixes(into: Set<string>, word: string, min: number): void {
  for (let len = min; len <= word.length; len++) into.add(word.slice(0, len));
}

export interface OrderSearchSource {
  readonly orderId: string;
  readonly fullName: string;
  readonly phone: string;
  readonly email: string | null;
}

/**
 * Every word staff may type to find this order: each name word and its starts, the phone (its
 * starts and ends, local and international), the email, its name part and the order number
 * (`a1b2c3` from `#A1B2C3`, plus the whole id).
 */
export function orderSearchTokens(source: OrderSearchSource): string[] {
  // Insertion order is priority order: a very long name loses its last pieces, never the number.
  const tokens = new Set<string>();

  const id = source.orderId.toLowerCase();
  if (id.length > 0) {
    tokens.add(id);
    addPrefixes(tokens, id.slice(0, 6), MIN_PREFIX_LEN);
  }

  for (const digits of phoneForms(source.phone)) {
    addPrefixes(tokens, digits, MIN_PHONE_DIGITS);
    for (let start = 0; start <= digits.length - MIN_PHONE_DIGITS; start++) tokens.add(digits.slice(start));
  }

  const email = (source.email ?? '').trim().toLowerCase();
  if (email.includes('@')) tokens.add(email);

  for (const word of orderSearchWords(source.fullName)) addPrefixes(tokens, word, MIN_PREFIX_LEN);

  if (email.includes('@')) {
    for (const word of orderSearchWords(email.split('@')[0] ?? '')) addPrefixes(tokens, word, MIN_PREFIX_LEN);
  }

  return [...tokens].slice(0, MAX_TOKENS);
}

/**
 * What staff typed, as the words to look for (every one must match). A phone typed with spaces
 * or a + ("+20 101 234 5678") counts as one number; "#A1B2C3" becomes "a1b2c3".
 */
export function orderSearchTerms(typed: string): string[] {
  const trimmed = typed.trim();
  if (trimmed.includes('@')) return [trimmed.toLowerCase()];
  if (/^[+\d\s\-()٠-٩۰-۹]+$/.test(trimmed)) {
    const forms = phoneForms(trimmed);
    if (forms.length > 0) return [forms[forms.length - 1] as string];
  }
  return [...new Set(orderSearchWords(trimmed).filter((word) => word.length >= MIN_PREFIX_LEN))];
}
