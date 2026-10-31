/** Scroll the row by one item (or to start/end). */
export function scrollRowByItem(el: HTMLElement, direction: 1 | -1): void {
  const children = Array.from(el.children) as HTMLElement[];
  if (children.length === 0) return;
  const containerRect = el.getBoundingClientRect();

  if (direction === 1) {
    const nextChild = children.find((child) => {
      const childRect = child.getBoundingClientRect();
      return childRect.left - containerRect.left > 12;
    });
    if (nextChild) {
      el.scrollBy({
        left: nextChild.getBoundingClientRect().left - containerRect.left,
        behavior: 'smooth',
      });
    } else {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
    return;
  }

  const prevChildren = children.filter((child) => {
    const childRect = child.getBoundingClientRect();
    return childRect.left - containerRect.left < -12;
  });
  const prevChild = prevChildren.at(-1);
  if (prevChild) {
    el.scrollBy({
      left: prevChild.getBoundingClientRect().left - containerRect.left,
      behavior: 'smooth',
    });
  } else {
    el.scrollTo({ left: 0, behavior: 'smooth' });
  }
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
