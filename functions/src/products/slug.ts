/** Lowercase kebab slug. Dashes are trimmed. An empty result falls back to the name. */
export function slugBase(rawSlug: string, name: string): string {
  const fromSlug = kebab(rawSlug);
  if (fromSlug) return fromSlug;
  return kebab(name) || 'product';
}

export function nextSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function kebab(value: string): string {
  let out = '';
  let pendingDash = false;
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isLetter || isDigit) {
      if (pendingDash && out.length > 0) out += '-';
      out += char;
      pendingDash = false;
    } else if (out.length > 0) {
      pendingDash = true;
    }
  }
  return out;
}
