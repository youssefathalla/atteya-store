/**
 * Where the row should land after one arrow step: the next (or previous) card's
 * start, or the row's start/end when no card is left that way.
 */
export function rowItemTarget(el: HTMLElement, direction: 1 | -1): number {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const children = Array.from(el.children) as HTMLElement[];
  if (children.length === 0) return direction === 1 ? max : 0;
  const containerLeft = el.getBoundingClientRect().left;
  const offsets = children.map((child) => child.getBoundingClientRect().left - containerLeft);

  if (direction === 1) {
    const next = offsets.find((offset) => offset > 12);
    if (next === undefined) return max;
    return Math.min(max, Math.max(0, el.scrollLeft + next));
  }

  const prev = offsets.filter((offset) => offset < -12).at(-1);
  if (prev === undefined) return 0;
  return Math.min(max, Math.max(0, el.scrollLeft + prev));
}

/** Scroll the row by one item (or to start/end). */
export function scrollRowByItem(el: HTMLElement, direction: 1 | -1): void {
  if (el.children.length === 0) return;
  el.scrollTo({ left: rowItemTarget(el, direction), behavior: 'smooth' });
}

export function rowScrollProgress(el: HTMLElement): {
  progress: number;
  canPrev: boolean;
  canNext: boolean;
} {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) {
    return { progress: 1, canPrev: false, canNext: false };
  }
  const left = el.scrollLeft;
  return {
    progress: Math.min(1, Math.max(0, left / max)),
    canPrev: left > 2,
    canNext: left < max - 2,
  };
}
