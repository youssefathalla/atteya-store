/**
 * Removes description images (after the caller copies them), scripts, styles,
 * and event or style attributes. Angular sanitises the HTML again on render.
 * Scanning is index-based so the cleaner stays linear.
 */

export interface CleanedDescription {
  readonly html: string | null;
  readonly imageUrls: readonly string[];
}

export function cleanDescription(raw: string): CleanedDescription {
  const imageUrls: string[] = [];
  let html = removeBlocks(raw, 'script');
  html = removeBlocks(html, 'style');
  html = removeImages(html, imageUrls);
  html = removeUnsafeAttributes(html);
  const trimmed = html.trim();
  return { html: trimmed.length > 0 ? trimmed : null, imageUrls };
}

function removeBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf(open, cursor);
    if (start === -1) {
      out += html.slice(cursor);
      break;
    }
    out += html.slice(cursor, start);
    const end = lower.indexOf(close, start + open.length);
    if (end === -1) break;
    const after = html.indexOf('>', end);
    if (after === -1) break;
    cursor = after + 1;
  }
  return out;
}

function removeImages(html: string, urls: string[]): string {
  const lower = html.toLowerCase();
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf('<img', cursor);
    if (start === -1) {
      out += html.slice(cursor);
      break;
    }
    out += html.slice(cursor, start);
    const end = html.indexOf('>', start);
    if (end === -1) break;
    const src = readAttribute(html.slice(start, end + 1), 'src');
    if (src) urls.push(src);
    cursor = end + 1;
  }
  return out;
}

function removeUnsafeAttributes(html: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start === -1) {
      out += html.slice(cursor);
      break;
    }
    out += html.slice(cursor, start);
    const end = html.indexOf('>', start);
    if (end === -1) {
      out += html.slice(start);
      break;
    }
    const tag = html.slice(start, end + 1);
    const lower = tag.toLowerCase();
    out += lower.startsWith('</') || lower.startsWith('<!') ? tag : stripAttributes(tag);
    cursor = end + 1;
  }
  return out;
}

function stripAttributes(tag: string): string {
  let cursor = 1;
  while (cursor < tag.length && !isSpace(tag[cursor] ?? '') && tag[cursor] !== '>' && tag[cursor] !== '/') {
    cursor += 1;
  }
  let out = tag.slice(0, cursor);
  while (cursor < tag.length) {
    const spaceStart = cursor;
    while (cursor < tag.length && isSpace(tag[cursor] ?? '')) cursor += 1;
    const spaces = tag.slice(spaceStart, cursor);
    if (cursor >= tag.length || tag[cursor] === '>' || tag[cursor] === '/') {
      out += spaces + tag.slice(cursor);
      break;
    }
    const nameStart = cursor;
    while (
      cursor < tag.length &&
      !isSpace(tag[cursor] ?? '') &&
      tag[cursor] !== '=' &&
      tag[cursor] !== '>' &&
      tag[cursor] !== '/'
    ) {
      cursor += 1;
    }
    const name = tag.slice(nameStart, cursor);
    let value = '';
    if (tag[cursor] === '=') {
      cursor += 1;
      const quote = tag[cursor];
      if (quote === '"' || quote === "'") {
        const end = tag.indexOf(quote, cursor + 1);
        if (end === -1) {
          value = tag.slice(cursor);
          cursor = tag.length;
        } else {
          value = tag.slice(cursor, end + 1);
          cursor = end + 1;
        }
      } else {
        const valueStart = cursor;
        while (cursor < tag.length && !isSpace(tag[cursor] ?? '') && tag[cursor] !== '>') cursor += 1;
        value = tag.slice(valueStart, cursor);
      }
    }
    const lower = name.toLowerCase();
    if (lower !== 'style' && !lower.startsWith('on')) {
      out += spaces + name;
      if (value) out += `=${value}`;
    }
  }
  return out;
}

function readAttribute(tag: string, attribute: string): string | null {
  const lower = tag.toLowerCase();
  const needle = `${attribute.toLowerCase()}=`;
  const at = lower.indexOf(needle);
  if (at === -1) return null;
  let cursor = at + needle.length;
  const quote = tag[cursor];
  if (quote === '"' || quote === "'") {
    const end = tag.indexOf(quote, cursor + 1);
    if (end === -1) return null;
    return tag.slice(cursor + 1, end).trim();
  }
  const start = cursor;
  while (cursor < tag.length && !isSpace(tag[cursor] ?? '') && tag[cursor] !== '>') cursor += 1;
  const value = tag.slice(start, cursor).trim();
  return value.length > 0 ? value : null;
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}
