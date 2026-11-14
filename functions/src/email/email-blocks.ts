/**
 * Building blocks for the shopper emails ("Bold Black" design, <KEY>-221), plus the staff new-order alert
 * blocks at the end (<KEY>-222): a black header with a
 * huge status, a big amount block, numbered steps, a full-width black button, item photos, totals
 * under a 3px black rule, grey info boxes and a black footer.
 *
 * Email-safe on purpose: tables and inline styles only (no flex, grid or `position`), 600px wide,
 * system fonts, buttons as padded `<a>` links, square corners except the round step circles.
 * One small `<style>` block only tightens the padding and the status size on narrow screens;
 * every email still reads correctly where a mail app drops it.
 *
 * Every function returns HTML for one `<tr>` of the 600px card (or a fragment that goes inside
 * one) and escapes all text it is given.
 */

export const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
export const INK = '#111111';
export const WHITE = '#ffffff';
export const GREY_BOX = '#f4f4f4';
export const GREY_PHOTO = '#ededed';
export const GREY_LINE = '#e5e5e5';
export const TEXT_MUTED = '#555555';
export const TEXT_SOFT = '#6b6b6b';
/** Text on the black header and footer. */
const ON_INK = '#e5e5e5';
const ON_INK_SOFT = '#9a9a9a';
/** Parts of the progress bar that are still to come. */
const ON_INK_TRACK = '#444444';

/** Side padding of every section (24px on narrow screens through the `.px` class). */
const SIDE = 40;
const CONTENT_WIDTH = 600 - SIDE * 2;

export interface EmailButton {
  readonly label: string;
  readonly url: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The whole message: a grey page with the 600px white card in the middle. */
export function emailDocument(title: string, rows: readonly string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<style>
@media only screen and (max-width:480px){
.px{padding-left:24px!important;padding-right:24px!important;}
.status{font-size:38px!important;}
.amount{font-size:32px!important;}
.stat{font-size:18px!important;}
.half{display:block!important;width:auto!important;padding:20px 24px!important;border-left:0!important;}
td.half + td.half{border-top:1px solid ${GREY_LINE}!important;}
.statcell{display:block!important;width:auto!important;padding:14px 24px!important;border-left:0!important;}
td.statcell + td.statcell{border-top:1px solid ${GREY_LINE}!important;}
.sphoto1{height:380px!important;}
.sphoto1 img{max-height:380px!important;}
.sphoto2{height:200px!important;}
.sphoto2 img{max-height:200px!important;}
.sphoto3{height:130px!important;}
.sphoto3 img{max-height:130px!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:${GREY_BOX};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GREY_BOX};">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${WHITE};${FONT}color:${INK};">
${rows.filter(Boolean).join('\n')}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A plain white section with the usual side padding. */
export function section(inner: string, padTop = 32, padBottom = 0): string {
  return `<tr><td class="px" style="padding:${padTop}px ${SIDE}px ${padBottom}px;${FONT}color:${INK};font-size:15px;line-height:1.5;">
${inner}
</td></tr>`;
}

export interface HeaderParts {
  readonly storeName: string;
  /** `#A1B2C3`, shown on the right; null for emails that are not about an order. */
  readonly ref: string | null;
  /** Small grey line above the status, e.g. `CASH ON DELIVERY`. */
  readonly kicker: string;
  /** The huge status, one entry per line, e.g. `['Order', 'Placed']`. Shown in capitals. */
  readonly status: readonly string[];
  readonly sentence: string;
  /** 0 Placed, 1 Confirmed, 2 Shipped, 3 Delivered; null for no progress bar. */
  readonly progress?: number | null;
}

const PROGRESS = ['Placed', 'Confirmed', 'Shipped', 'Delivered'] as const;

export function header(parts: HeaderParts): string {
  const ref = parts.ref
    ? `<td align="right" style="${FONT}font-size:13px;color:${ON_INK};white-space:nowrap;">${escapeHtml(parts.ref)}</td>`
    : '';
  const status = parts.status.map((line) => escapeHtml(line.toUpperCase())).join('<br>');
  const progress = parts.progress === null || parts.progress === undefined ? '' : progressBar(parts.progress);
  return `<tr><td class="px" style="background:${INK};padding:28px ${SIDE}px 40px;${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="${FONT}font-size:14px;font-weight:800;letter-spacing:4px;color:${WHITE};">${escapeHtml(parts.storeName.toUpperCase())}</td>
${ref}
</tr></table>
<p style="margin:44px 0 10px;${FONT}font-size:12px;font-weight:600;letter-spacing:2px;color:${ON_INK_SOFT};">${escapeHtml(parts.kicker.toUpperCase())}</p>
<h1 class="status" style="margin:0;${FONT}font-size:48px;line-height:1;font-weight:800;letter-spacing:-1px;color:${WHITE};">${status}</h1>
<p style="margin:20px 0 0;${FONT}font-size:16px;line-height:1.55;color:${ON_INK};">${escapeHtml(parts.sentence)}</p>
${progress}
</td></tr>`;
}

/** Four parts inside the black header: done parts white, the current label bold. */
function progressBar(current: number): string {
  const cells = PROGRESS.map((label, index) => {
    const done = index <= current;
    const color = done ? WHITE : ON_INK_SOFT;
    const weight = index === current ? 'font-weight:700;' : '';
    const gap = index < PROGRESS.length - 1 ? 'padding-right:6px;' : '';
    return `<td width="25%" valign="top" style="${gap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:${done ? WHITE : ON_INK_TRACK};">&nbsp;</td></tr></table>
<p style="margin:8px 0 0;${FONT}font-size:12px;${weight}color:${color};">${escapeHtml(label)}</p>
</td>`;
  }).join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>
${cells}
</tr></table>`;
}

export interface AmountCell {
  readonly label: string;
  readonly amount: string;
  readonly note?: string | null;
}

/**
 * The big amount under the header: one cell, or two side by side (Pay Now / At Your Door).
 * `check` adds a black ✓ circle on the right (paid).
 */
export function amountBlock(cells: readonly AmountCell[], check = false): string {
  const two = cells.length > 1;
  const tds = cells
    .map((cell, index) => {
      const divider = index > 0 ? `border-left:1px solid ${GREY_LINE};` : '';
      const pad = two
        ? index === 0
          ? `padding:28px 16px 28px ${SIDE}px;`
          : `padding:28px ${SIDE}px 28px 20px;`
        : `padding:28px ${SIDE}px;`;
      const note = cell.note
        ? `<p style="margin:8px 0 0;${FONT}font-size:13px;line-height:1.5;color:${TEXT_MUTED};">${escapeHtml(cell.note)}</p>`
        : '';
      return `<td class="${two ? 'half' : 'px'}" valign="top" width="${two ? '50%' : '100%'}" style="${pad}${divider}">
<p style="margin:0 0 6px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">${escapeHtml(cell.label.toUpperCase())}</p>
<p class="amount" style="margin:0;${FONT}font-size:${two ? 32 : 40}px;line-height:1.1;font-weight:800;letter-spacing:-1px;color:${INK};">${escapeHtml(cell.amount)}</p>
${note}
</td>`;
    })
    .join('\n');
  const tick = check
    ? `<td width="${52 + SIDE}" valign="middle" align="right" style="width:${52 + SIDE}px;padding:28px ${SIDE}px 28px 0;">${circle('✓', 'filled', 52, 22)}</td>`
    : '';
  return `<tr><td style="padding:0;border-bottom:1px solid ${GREY_LINE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${tds}
${tick}
</tr></table>
</td></tr>`;
}

/** A round number or ✓ (`filled`: black with white text; `outlined`: black ring). */
function circle(content: string, style: 'filled' | 'outlined', size = 24, fontSize = 12): string {
  const colors =
    style === 'filled'
      ? `background:${INK};color:${WHITE};border:1px solid ${INK};`
      : `background:${WHITE};color:${INK};border:1.5px solid ${INK};`;
  const inner = size - 2;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr><td width="${inner}" height="${inner}" align="center" valign="middle" style="width:${inner}px;min-width:${inner}px;height:${inner}px;border-radius:50%;${colors}${FONT}font-size:${fontSize}px;font-weight:700;line-height:${inner}px;text-align:center;">${escapeHtml(content)}</td></tr></table>`;
}

export interface EmailStep {
  /** `done`: ✓ in a black circle. `current`: black filled number. `next`: outlined number. */
  readonly state: 'done' | 'current' | 'next';
  readonly title: string;
  readonly note?: string | null;
  /** Shown bold on the right of the title, e.g. `EGP 115`. */
  readonly amount?: string | null;
  /** Extra HTML under the note (the InstaPay or bank details box). Already escaped. */
  readonly boxHtml?: string;
  /** A line under the box (the "I pay all fees" line). */
  readonly after?: string | null;
}

/**
 * Numbered steps joined by a thin grey line. Each step is two rows: the circle with the title,
 * then the note and box next to the line (the line is a cell border, so it grows with the text).
 */
export function steps(list: readonly EmailStep[]): string {
  const rows = list
    .map((step, index) => {
      const last = index === list.length - 1;
      const mark =
        step.state === 'done'
          ? circle('✓', 'filled')
          : circle(String(index + 1), step.state === 'current' ? 'filled' : 'outlined');
      const titleColor = step.state === 'done' ? TEXT_SOFT : INK;
      const amount = step.amount
        ? `<td align="right" valign="top" style="padding:3px 0 0 12px;${FONT}font-size:15px;font-weight:700;white-space:nowrap;color:${INK};">${escapeHtml(step.amount)}</td>`
        : '';
      const note = step.note
        ? `<p style="margin:0;${FONT}font-size:13px;line-height:1.5;color:${TEXT_SOFT};">${escapeHtml(step.note)}</p>`
        : '';
      const after = step.after
        ? `<p style="margin:12px 0 0;${FONT}font-size:13px;line-height:1.5;color:${TEXT_MUTED};">${escapeHtml(step.after)}</p>`
        : '';
      const line = last ? '' : `border-left:1px solid #cccccc;`;
      return `<tr>
<td width="24" valign="top" colspan="2" style="width:24px;padding:0;">${mark}</td>
<td valign="top" style="padding:3px 0 0 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="${FONT}font-size:15px;font-weight:700;line-height:1.4;color:${titleColor};">${escapeHtml(step.title)}</td>
${amount}
</tr></table>
</td>
</tr>
<tr>
<td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
<td width="12" style="width:12px;font-size:0;line-height:0;${line}">&nbsp;</td>
<td valign="top" style="padding:2px 0 ${last ? 0 : 22}px 16px;">
${note}${step.boxHtml ?? ''}${after}
</td>
</tr>`;
    })
    .join('\n');
  return section(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${rows}
</table>`,
    32,
  );
}

/** Label / value rows in a grey box (InstaPay address and number). */
export function detailsBox(rows: readonly (readonly [string, string])[]): string {
  const trs = rows
    .map(
      ([label, value]) => `<tr>
<td style="padding:3px 0;${FONT}font-size:13px;color:${TEXT_MUTED};">${escapeHtml(label)}</td>
<td align="right" style="padding:3px 0 3px 12px;${FONT}font-size:13px;font-weight:700;color:${INK};word-break:break-all;">${escapeHtml(value)}</td>
</tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:${GREY_BOX};">
<tr><td style="padding:14px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${trs}
</table>
</td></tr>
</table>`;
}

/**
 * Bank details: white rows split by thin lines inside a black border, then the reference on a
 * black row. `mono` values (IBAN, SWIFT, reference) use a monospace font.
 */
export function bankBox(
  rows: readonly { readonly label: string; readonly value: string; readonly mono: boolean }[],
  reference: string,
): string {
  const mono = "font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;";
  const trs = rows
    .map(
      (row) => `<tr>
<td style="padding:10px 14px;border-bottom:1px solid ${GREY_LINE};${FONT}font-size:13px;color:${TEXT_MUTED};white-space:nowrap;">${escapeHtml(row.label)}</td>
<td align="right" style="padding:10px 14px;border-bottom:1px solid ${GREY_LINE};${row.mono ? mono : FONT}font-size:13px;font-weight:700;color:${INK};word-break:normal;word-wrap:break-word;overflow-wrap:anywhere;">${escapeHtml(row.value)}</td>
</tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border:1px solid ${INK};border-collapse:collapse;">
${trs}
<tr>
<td style="padding:10px 14px;background:${INK};${FONT}font-size:13px;color:${WHITE};">Reference</td>
<td align="right" style="padding:10px 14px;background:${INK};${mono}font-size:13px;font-weight:700;color:${WHITE};">${escapeHtml(reference)}</td>
</tr>
</table>`;
}

/** Full-width black button. */
export function mainButton(button: EmailButton, padTop = 28): string {
  return section(fullWidthLink(button, 'filled'), padTop);
}

/** Full-width link button; `outlined` is a black ring on white. */
export function fullWidthLink(button: EmailButton, variant: 'filled' | 'outlined'): string {
  const colors =
    variant === 'filled'
      ? `background:${INK};color:${WHITE};border:2px solid ${INK};`
      : `background:${WHITE};color:${INK};border:2px solid ${INK};`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="${colors}">
<a href="${escapeHtml(button.url)}" style="display:block;padding:15px 20px;${FONT}font-size:16px;font-weight:700;color:${variant === 'filled' ? WHITE : INK};text-decoration:none;text-align:center;">${escapeHtml(button.label)}</a>
</td></tr></table>`;
}

/** Bold section title ("Your Items", "Still Want These?"). */
export function sectionTitle(title: string): string {
  return `<h2 style="margin:0 0 18px;${FONT}font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-0.5px;color:${INK};">${escapeHtml(title)}</h2>`;
}

/** Plain paragraph in a section. */
export function paragraphHtml(text: string, color: string = INK, size = 15): string {
  return `<p style="margin:0 0 12px;${FONT}font-size:${size}px;line-height:1.55;color:${color};">${escapeHtml(text)}</p>`;
}

export interface ItemCard {
  readonly name: string;
  /** "Size M · Black · Qty 2". */
  readonly details: string;
  /** "EGP 1,700", "Free", or null to leave the price out. */
  readonly price: string | null;
  readonly imageSrc: string | null;
  /** Black tags above the photo, e.g. `FREE GIFT`, `1 FREE`. */
  readonly tags: readonly string[];
  /** Free gifts that come with this item: a slim strip under it, never a card of their own. */
  readonly gifts?: readonly ItemGift[];
}

export interface ItemGift {
  readonly name: string;
  /** "Size M · Qty 1". */
  readonly details: string;
}

/** The free-gift strips under an item (a black FREE GIFT tag, the gift's name and details). */
function giftStrips(gifts: readonly ItemGift[] | undefined, margin: string): string {
  if (!gifts?.length) return '';
  return gifts
    .map(
      (gift) =>
        `<div style="margin:${margin};padding:8px 10px;background:${GREY_BOX};border-left:3px solid ${INK};">${tagHtml(['Free gift'])}<p style="margin:0;${FONT}font-size:13px;font-weight:700;line-height:1.35;color:${INK};"><span>${escapeHtml(gift.name)}</span></p>${gift.details ? `<p style="margin:2px 0 0;${FONT}font-size:12px;color:${TEXT_SOFT};">${escapeHtml(gift.details)}</p>` : ''}</div>`,
    )
    .join('');
}

function tagHtml(tags: readonly string[]): string {
  if (tags.length === 0) return '';
  return tags
    .map(
      (tag) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 7px;background:${INK};${FONT}font-size:10px;font-weight:700;letter-spacing:1px;color:${WHITE};">${escapeHtml(tag.toUpperCase())}</span>`,
    )
    .join('');
}

/**
 * A photo fitted inside a fixed-height grey box (like `object-fit: contain`): the picture is centred
 * and limited by `max-width` / `max-height`, never cropped, so every photo in a row is the same
 * height whatever its shape. A table cell is used because many mail apps ignore `object-fit`.
 * `boxClass` lets the narrow-screen style shrink the box. The `width` attribute is the box's pixel
 * width: Outlook for Windows ignores `max-width` / `max-height` and would otherwise draw the photo
 * at its natural size; clients that read CSS use the inline `width:auto` instead.
 */
function photo(src: string | null, width: number, height: number, boxClass = ''): string {
  const img = src
    ? `<img src="${escapeHtml(src)}" alt="" width="${width}" style="display:block;margin:0 auto;width:auto;height:auto;max-width:100%;max-height:${height}px;border:0;">`
    : '&nbsp;';
  const cls = boxClass ? ` class="${boxClass}"` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr><td${cls} height="${height}" align="center" valign="middle" style="width:100%;height:${height}px;background:${GREY_PHOTO};text-align:center;font-size:0;line-height:0;">${img}</td></tr></table>`;
}

/**
 * Items as photo cards, never more than 2 to a row (three narrow cards read badly on a phone).
 * With `compactAfter` or more cards, a compact list (64px photo, name, details, price on the right)
 * keeps long orders short.
 */
export function itemGrid(cards: readonly ItemCard[], compactAfter: number | null = 4): string {
  if (compactAfter !== null && cards.length > compactAfter) return itemList(cards);
  const perRow = 2;
  const gap = 16;
  const cellWidth = Math.floor((CONTENT_WIDTH - gap * (perRow - 1)) / perRow);
  const photoHeight = Math.round(cellWidth * 0.85);
  // Percent widths so the row shrinks on phones; the photo keeps its pixel width for Outlook.
  const cellPercent = `${Math.floor(100 / perRow)}%`;
  const rows: string[] = [];
  for (let start = 0; start < cards.length; start += perRow) {
    const slice = cards.slice(start, start + perRow);
    const tds = Array.from({ length: perRow }, (_, index) => {
      const card = slice[index];
      // Each cell gives up the same share of the gaps, so every column (and photo) is the same width.
      const left = Math.round((gap * index) / perRow);
      const right = Math.round((gap * (perRow - 1 - index)) / perRow);
      const pad = `${left ? `padding-left:${left}px;` : ''}${right ? `padding-right:${right}px;` : ''}`;
      if (!card) return `<td width="${cellPercent}" valign="top" style="${pad}">&nbsp;</td>`;
      const price = card.price
        ? `<p style="margin:6px 0 0;${FONT}font-size:15px;font-weight:700;color:${INK};">${escapeHtml(card.price)}</p>`
        : '';
      const details = card.details
        ? `<p style="margin:3px 0 0;${FONT}font-size:13px;color:${TEXT_SOFT};">${escapeHtml(card.details)}</p>`
        : '';
      const tags = card.tags.length ? `<div style="margin:0 0 2px;">${tagHtml(card.tags)}</div>` : '';
      return `<td width="${cellPercent}" valign="top" style="${pad}padding-bottom:24px;">
${tags}${photo(card.imageSrc, cellWidth, photoHeight)}
<p style="margin:12px 0 0;${FONT}font-size:15px;font-weight:700;line-height:1.35;color:${INK};">${escapeHtml(card.name)}</p>
${details}${price}${giftStrips(card.gifts, '10px 0 0')}
</td>`;
    }).join('\n');
    rows.push(`<tr>\n${tds}\n</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
${rows.join('\n')}
</table>`;
}

function itemList(cards: readonly ItemCard[]): string {
  const rows = cards
    .map((card) => {
      const thumb = `<table role="presentation" width="64" cellpadding="0" cellspacing="0"><tr><td width="64" height="64" align="center" valign="middle" style="width:64px;height:64px;background:${GREY_PHOTO};text-align:center;font-size:0;line-height:0;">${
        card.imageSrc
          ? `<img src="${escapeHtml(card.imageSrc)}" alt="" width="64" style="display:block;margin:0 auto;width:auto;height:auto;max-width:64px;max-height:64px;border:0;">`
          : '&nbsp;'
      }</td></tr></table>`;
      const tags = card.tags.length ? `<div>${tagHtml(card.tags)}</div>` : '';
      const details = card.details
        ? `<p style="margin:3px 0 0;${FONT}font-size:13px;color:${TEXT_SOFT};">${escapeHtml(card.details)}</p>`
        : '';
      const price = card.price
        ? `<td align="right" valign="top" style="padding:12px 0 12px 12px;border-bottom:1px solid ${GREY_LINE};${FONT}font-size:15px;font-weight:700;white-space:nowrap;color:${INK};">${escapeHtml(card.price)}</td>`
        : `<td style="border-bottom:1px solid ${GREY_LINE};">&nbsp;</td>`;
      return `<tr>
<td width="64" valign="top" style="padding:12px 0;border-bottom:1px solid ${GREY_LINE};">${thumb}</td>
<td valign="top" style="padding:12px 0 12px 14px;border-bottom:1px solid ${GREY_LINE};">
${tags}<p style="margin:0;${FONT}font-size:15px;font-weight:700;line-height:1.35;color:${INK};">${escapeHtml(card.name)}</p>
${details}${giftStrips(card.gifts, '8px 0 0')}
</td>
${price}
</tr>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
${rows}
</table>`;
}

/** A row of photos edge to edge across the card, with a grey line of names under it. */
export function photoStrip(cards: readonly ItemCard[], captions: string): string {
  const shown = cards.slice(0, 2);
  if (shown.length === 0) return '';
  const width = Math.floor(600 / shown.length);
  // Percent widths: fixed pixel widths make a fixed-layout table wider than a phone screen.
  const cellPercent = `${Math.floor(100 / shown.length)}%`;
  const tds = shown
    .map(
      (card) =>
        `<td width="${cellPercent}" valign="top" style="padding:0;">${photo(card.imageSrc, width, Math.round(width * 1.1), `sphoto${shown.length}`)}</td>`,
    )
    .join('\n');
  return `<tr><td style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>
${tds}
</tr></table>
</td></tr>
<tr><td class="px" style="padding:12px ${SIDE}px;background:${GREY_BOX};${FONT}font-size:13px;line-height:1.5;color:${TEXT_MUTED};">${escapeHtml(captions)}</td></tr>`;
}

/**
 * Totals under a 3px black rule. The last of `rows` is the big total; `after` rows sit under it
 * in bold (Bank Transfer's "You send").
 */
export function totals(
  rows: readonly (readonly [string, string])[],
  after: readonly (readonly [string, string])[] = [],
): string {
  const body = rows
    .map(([label, value], index) => {
      const isTotal = index === rows.length - 1;
      const style = isTotal
        ? `padding:12px 0 4px;${FONT}font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${INK};`
        : `padding:4px 0;${FONT}font-size:15px;color:${INK};`;
      return `<tr>
<td style="${style}">${escapeHtml(label)}</td>
<td align="right" style="${style}white-space:nowrap;">${escapeHtml(value)}</td>
</tr>`;
    })
    .join('\n');
  const extra = after
    .map(
      ([label, value]) => `<tr>
<td style="padding:2px 0;${FONT}font-size:15px;font-weight:700;color:${INK};">${escapeHtml(label)}</td>
<td align="right" style="padding:2px 0;${FONT}font-size:15px;font-weight:700;color:${INK};white-space:nowrap;">${escapeHtml(value)}</td>
</tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:3px solid ${INK};">
<tr><td colspan="2" style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
${body}
${extra}
</table>`;
}

export interface InfoBox {
  readonly label: string;
  readonly lines: readonly string[];
}

/** One or two grey boxes side by side (Delivery To / Payment). */
export function infoBoxes(boxes: readonly InfoBox[]): string {
  const two = boxes.length > 1;
  const tds = boxes
    .map((box, index) => {
      // The gap is a white border, so the two boxes never merge when a mail app drops widths.
      const gap = index > 0 ? `border-left:12px solid ${WHITE};` : '';
      const lines = box.lines.map(escapeHtml).join('<br>');
      return `<td width="${two ? '50%' : '100%'}" valign="top" style="padding:18px 18px 20px;background:${GREY_BOX};${gap}">
<p style="margin:0 0 8px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">${escapeHtml(box.label.toUpperCase())}</p>
<p style="margin:0;${FONT}font-size:14px;line-height:1.55;color:${INK};word-break:break-word;">${lines}</p>
</td>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
${tds}
</tr></table>`;
}

/** Underlined bold text link, e.g. "View Your Order →". */
export function textLink(button: EmailButton): string {
  return `<p style="margin:0;${FONT}font-size:15px;"><a href="${escapeHtml(button.url)}" style="color:${INK};font-weight:700;text-decoration:underline;">${escapeHtml(button.label)}</a></p>`;
}

export interface FooterParts {
  readonly storeName: string;
  /** "Questions? We answer on WhatsApp." */
  readonly line: string | null;
  /** Outlined white button (Message Us on WhatsApp), or null. */
  readonly button: EmailButton | null;
  /** `atteyastore.com`, or '' to leave it out. */
  readonly site: string;
  readonly siteUrl: string;
  /** Ready-made HTML for the line instead of `line` (a sentence with a link in it). */
  readonly lineHtml?: string | null;
  /** False leaves the wordmark out (Confirm Your Email). */
  readonly wordmark?: boolean;
}

export function footer(parts: FooterParts): string {
  const showMark = parts.wordmark !== false;
  const lineBody = parts.lineHtml ?? (parts.line ? escapeHtml(parts.line) : '');
  const line = lineBody
    ? `<p style="margin:${showMark ? 14 : 0}px 0 0;${FONT}font-size:15px;line-height:1.5;color:${ON_INK};">${lineBody}</p>`
    : '';
  const mark = showMark
    ? `<p style="margin:0;${FONT}font-size:14px;font-weight:800;letter-spacing:4px;color:${WHITE};">${escapeHtml(parts.storeName.toUpperCase())}</p>\n`
    : '';
  const button = parts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:18px auto 0;"><tr><td align="center" style="border:2px solid ${WHITE};">
<a href="${escapeHtml(parts.button.url)}" style="display:inline-block;padding:12px 22px;${FONT}font-size:14px;font-weight:700;color:${WHITE};text-decoration:none;">${escapeHtml(parts.button.label)}</a>
</td></tr></table>`
    : '';
  const site = parts.site
    ? `<p style="margin:18px 0 0;${FONT}font-size:12px;"><a href="${escapeHtml(parts.siteUrl)}" style="color:${ON_INK_SOFT};text-decoration:none;">${escapeHtml(parts.site)}</a></p>`
    : '';
  return `<tr><td class="px" align="center" style="background:${INK};padding:36px ${SIDE}px 32px;text-align:center;${FONT}">
${mark}${line}${button}${site}
</td></tr>`;
}

/** `https://www.atteyastore.com` → `atteyastore.com`; '' when unreadable. */
export function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ── Staff alert blocks (<KEY>-222) ──────────────────────────────────────────

export interface StaffHeaderParts {
  readonly storeName: string;
  /** `NEW ORDER · 12 NOV · 14:32`, or the warning (`CHECK THIS ORDER`). */
  readonly kicker: string;
  /** The order total, very large (`EGP 11,315`). */
  readonly amount: string;
  /** A smaller line under the amount (the EGP total of a Bank Transfer order), or null. */
  readonly amountNote: string | null;
  /** `#A1B2C3 · Cash on Delivery`. */
  readonly refLine: string;
  /** The warning sentence under the ref, or null. */
  readonly sentence: string | null;
}

/** Black header of the staff alert: wordmark with an outlined STAFF tag, then the order's worth. */
export function staffHeader(parts: StaffHeaderParts): string {
  const note = parts.amountNote
    ? `<p style="margin:8px 0 0;${FONT}font-size:16px;font-weight:600;color:${ON_INK};">${escapeHtml(parts.amountNote)}</p>`
    : '';
  const sentence = parts.sentence
    ? `<p style="margin:16px 0 0;${FONT}font-size:16px;line-height:1.55;font-weight:600;color:${WHITE};">${escapeHtml(parts.sentence)}</p>`
    : '';
  return `<tr><td class="px" style="background:${INK};padding:28px ${SIDE}px 36px;${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="${FONT}font-size:14px;font-weight:800;letter-spacing:4px;color:${WHITE};">${escapeHtml(parts.storeName.toUpperCase())}</td>
<td align="right"><table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr><td style="padding:4px 10px;border:1.5px solid ${WHITE};${FONT}font-size:12px;font-weight:800;letter-spacing:2px;color:${WHITE};">STAFF</td></tr></table></td>
</tr></table>
<p style="margin:44px 0 10px;${FONT}font-size:12px;font-weight:600;letter-spacing:2px;color:${ON_INK_SOFT};">${escapeHtml(parts.kicker.toUpperCase())}</p>
<h1 class="status" style="margin:0;${FONT}font-size:52px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;color:${WHITE};">${escapeHtml(parts.amount)}</h1>
${note}
<p style="margin:16px 0 0;${FONT}font-size:18px;font-weight:700;color:${WHITE};">${escapeHtml(parts.refLine)}</p>
${sentence}
</td></tr>`;
}

/** Two or three amounts side by side under the staff header (ITEMS / FEE BY INSTAPAY / CASH AT DOOR), each with an optional small note under it. */
export function statStrip(cells: readonly AmountCell[]): string {
  const width = `${Math.floor(100 / Math.max(1, cells.length))}%`;
  const tds = cells
    .map((cell, index) => {
      const first = index === 0;
      const last = index === cells.length - 1;
      const divider = first ? '' : `border-left:1px solid ${GREY_LINE};`;
      const pad = `padding:24px ${last ? SIDE : 16}px 24px ${first ? SIDE : 20}px;`;
      return `<td class="${first ? 'px statcell' : 'statcell'}" valign="top" width="${width}" style="${pad}${divider}">
<p style="margin:0 0 6px;${FONT}font-size:11px;font-weight:600;letter-spacing:2px;color:${TEXT_MUTED};">${escapeHtml(cell.label.toUpperCase())}</p>
<p class="stat" style="margin:0;${FONT}font-size:24px;line-height:1.15;font-weight:800;letter-spacing:-0.5px;color:${INK};overflow-wrap:break-word;">${escapeHtml(cell.amount)}</p>${
        cell.note
          ? `\n<p style="margin:6px 0 0;${FONT}font-size:13px;line-height:1.4;color:${TEXT_MUTED};">${escapeHtml(cell.note)}</p>`
          : ''
      }
</td>`;
    })
    .join('\n');
  return `<tr><td style="padding:0;border-bottom:1px solid ${GREY_LINE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>
${tds}
</tr></table>
</td></tr>`;
}

/** Grey "next step" box with a black number circle, the action in bold and a note under it. */
export function nextStepBox(action: string, note: string | null): string {
  const noteHtml = note
    ? `<p style="margin:4px 0 0;${FONT}font-size:14px;line-height:1.5;color:${TEXT_MUTED};">${escapeHtml(note)}</p>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GREY_BOX};"><tr>
<td width="24" valign="top" style="width:24px;padding:18px 0 18px 18px;">${circle('1', 'filled')}</td>
<td valign="top" style="padding:20px 18px 18px 14px;">
<p style="margin:0;${FONT}font-size:15px;font-weight:700;line-height:1.4;color:${INK};">${escapeHtml(action)}</p>
${noteHtml}
</td>
</tr></table>`;
}

/** Outlined black button sized to its label (Message Customer on WhatsApp). */
export function outlinedButton(button: EmailButton): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border:2px solid ${INK};">
<a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 22px;${FONT}font-size:15px;font-weight:700;color:${INK};text-decoration:none;">${escapeHtml(button.label)}</a>
</td></tr></table>`;
}
