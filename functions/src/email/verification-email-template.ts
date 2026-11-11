import { buttonHtml, h1, layout, paragraph, smallText, type RenderedEmail } from './order-email-templates.js';

/**
 * The "Confirm Your Email" message sent by `sendVerificationEmail` to a new email/password account.
 * Pure: the link comes from the Admin SDK (`generateEmailVerificationLink`), the brand name from
 * `STORE_INFO`. Same look as the order emails (shared layout and black button).
 */
export interface VerificationEmailInput {
  readonly storeName: string;
  /** The confirmation link from `generateEmailVerificationLink`. */
  readonly link: string;
}

const SUBJECT = 'Confirm Your Email';
const BODY = 'Tap the button below to confirm this is your email address.';
const BUTTON = 'Confirm Email';
const EXPIRES =
  "This link expires after a while. You can ask for a new one from your account. If you didn't create an account, you can ignore this email.";

export function renderVerificationEmail(input: VerificationEmailInput): RenderedEmail {
  const html = layout(input.storeName, SUBJECT, [
    h1(SUBJECT),
    paragraph(BODY),
    buttonHtml({ label: BUTTON, url: input.link }),
    smallText(EXPIRES),
  ]);
  const text = [SUBJECT, '', BODY, '', `${BUTTON}: ${input.link}`, '', EXPIRES].join('\n');
  return { subject: SUBJECT, html, text };
}
