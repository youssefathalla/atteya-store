/**
 * One-line card blurb: prefer `summary`, else the first plain line of `descriptionHtml`.
 * Always ≤ 300 chars so Algolia SearchHitSchema never drops hits.
 */

export const CARD_SHORT_DESCRIPTION_MAX = 300;

export function cardShortDescription(
  summary: string | null | undefined,
  descriptionHtml: string | null | undefined,
): string {
  const fromSummary = typeof summary === 'string' ? summary.trim() : '';
  if (fromSummary.length > 0) return clip(fromSummary, CARD_SHORT_DESCRIPTION_MAX);
  return clip(firstPlainLine(descriptionHtml), CARD_SHORT_DESCRIPTION_MAX);
}

function firstPlainLine(html: string | null | undefined): string {
  if (typeof html !== 'string' || html.trim().length === 0) return '';
  const plain = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\f\v]+/g, ' ')
    .trim();
  if (plain.length === 0) return '';
  const line = plain.split(/\n+/)[0]?.trim() ?? '';
  return line;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}
