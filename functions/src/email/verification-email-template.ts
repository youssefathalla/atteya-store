import { whatsappChatUrl } from '../store/store-info.js';
import {
  emailDocument,
  escapeHtml,
  FONT,
  footer,
  fullWidthLink,
  header,
  INK,
  paragraphHtml,
  section,
  siteLabel,
  TEXT_MUTED,
  TEXT_SOFT,
} from './email-blocks.js';
import type { RenderedEmail } from './order-email-templates.js';

/**
 * The "Confirm Your Email" message sent by `sendVerificationEmail` to a new email/password account.
 * Pure: the link comes from the Admin SDK (`generateEmailVerificationLink`), the brand name and
 * WhatsApp number from `STORE_INFO`. Same "Bold Black" look as the order emails (<KEY>-221).
 */
export interface VerificationEmailInput {
  readonly storeName: string;
  /** The confirmation link from `generateEmailVerificationLink`. */
  readonly link: string;
  /** Business WhatsApp (`STORE_INFO.contact.whatsapp`), or '' / missing for none. */
  readonly whatsappNumber?: string;
  /** Storefront origin for the footer (`STOREFRONT_URL`), or '' / missing to leave it out. */
  readonly storefrontUrl?: string;
}

const SUBJECT = 'Confirm Your Email';
const BODY = 'Tap the button below to confirm this is your email address.';
const BUTTON = 'Confirm Email';
const EXPIRES =
  "This link expires after a while. You can ask for a new one from your account. If you didn't create an account, you can ignore this email.";
const POINTS: readonly (readonly [string, string])[] = [
  ['Save orders', 'to your account'],
  ['Member prices', 'on offers for signed-in shoppers'],
  ['Favorites', 'on any device'],
];

export function renderVerificationEmail(input: VerificationEmailInput): RenderedEmail {
  const waNumber = (input.whatsappNumber ?? '').trim();
  const waLink = whatsappChatUrl(waNumber);
  const siteUrl = (input.storefrontUrl ?? '').trim();
  const html = emailDocument(SUBJECT, [
    header({
      storeName: input.storeName,
      ref: null,
      kicker: 'One last step',
      status: ['Confirm', 'Your Email'],
      sentence: BODY,
    }),
    section(fullWidthLink({ label: BUTTON, url: input.link }, 'filled'), 40),
    section(pointsHtml(), 32),
    section(paragraphHtml(EXPIRES, TEXT_MUTED, 14), 20, 40),
    footerHtml(input.storeName, waLink, siteUrl),
  ]);
  const text = [
    SUBJECT,
    '',
    BODY,
    '',
    `${BUTTON}: ${input.link}`,
    '',
    ...POINTS.map(([title, rest]) => `- ${title} ${rest}`),
    '',
    EXPIRES,
    ...(waLink ? ['', `Questions? Message us on WhatsApp: ${waNumber} (${waLink})`] : []),
  ].join('\n');
  return { subject: SUBJECT, html, text };
}

/** Three short points, each under a 3px black line. */
function pointsHtml(): string {
  const cells = POINTS.map(([title, rest], index) => {
    const gap = index < POINTS.length - 1 ? 'padding-right:16px;' : '';
    return `<td width="33%" valign="top" style="${gap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:3px solid ${INK};padding-top:14px;">
<p style="margin:0;${FONT}font-size:15px;font-weight:700;color:${INK};">${escapeHtml(title)}</p>
<p style="margin:2px 0 0;${FONT}font-size:14px;line-height:1.45;color:${TEXT_SOFT};">${escapeHtml(rest)}</p>
</td></tr></table>
</td>`;
  }).join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>
${cells}
</tr></table>`;
}

/** Black footer: "Questions? Message us on WhatsApp" as a link when the number is set, then the site. */
function footerHtml(storeName: string, waLink: string | null, siteUrl: string): string {
  return footer({
    storeName,
    line: null,
    button: null,
    site: siteLabel(siteUrl),
    siteUrl,
    wordmark: false,
    lineHtml: waLink
      ? `Questions? <a href="${escapeHtml(waLink)}" style="color:#ffffff;font-weight:700;text-decoration:underline;">Message us on WhatsApp</a>`
      : null,
  });
}
