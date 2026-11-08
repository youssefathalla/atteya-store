import type { gsap as GsapNamespace } from 'gsap';

type GsapApi = typeof GsapNamespace;

const OUT_DURATION = 0.35;
const IN_DURATION = 0.5;

/** `data-nav-index` on a photo or an arrow. */
function photoIndex(photo: HTMLElement): number {
  const raw = photo.dataset['navIndex'];
  const index = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(index) ? index : -1;
}

/**
 * The `<img>` inside the photo for `index` when it has not finished loading,
 * otherwise null. A swap to a photo that is still downloading would fade in
 * an empty frame and then pop the picture in, so the caller waits for it.
 * A photo that has finally failed (both the ImageKit and the Storage URL)
 * will never load, so it counts as settled: `AppImageFallbackDirective`
 * keeps `.skeleton` on the image only while it is still trying.
 */
export function pendingNavListImage(
  photos: readonly HTMLElement[],
  index: number,
): HTMLImageElement | null {
  const photo = photos.find((candidate) => photoIndex(candidate) === index);
  const img = photo?.querySelector('img');
  if (!img || !img.complete) return img ?? null;
  if (img.naturalWidth > 0) return null;
  return img.classList.contains('skeleton') ? img : null;
}

/**
 * Puts the active photo on top with no tween. Used before hydration styles
 * are replaced, and whenever motion should not play.
 */
export function settleNavListPhotos(
  gsap: GsapApi,
  photos: readonly HTMLElement[],
  activeIndex: number,
): void {
  for (const photo of photos) {
    const active = photoIndex(photo) === activeIndex;
    gsap.set(photo, {
      opacity: active ? 1 : 0,
      scale: 1,
      overwrite: 'auto',
    });
  }
}

/**
 * Crossfades to the active photo. The outgoing image fades; the incoming
 * image rises from a slight scale. `overwrite: 'auto'` keeps fast hovering
 * from leaving a blank or fully doubled panel.
 */
export function playNavListSwap(
  gsap: GsapApi,
  photos: readonly HTMLElement[],
  activeIndex: number,
  reduceMotion: boolean,
): void {
  for (const photo of photos) {
    const active = photoIndex(photo) === activeIndex;
    if (reduceMotion) {
      gsap.set(photo, {
        opacity: active ? 1 : 0,
        scale: 1,
        overwrite: 'auto',
      });
      continue;
    }

    if (active) {
      gsap.fromTo(
        photo,
        { opacity: 0, scale: 1.03 },
        {
          opacity: 1,
          scale: 1,
          duration: IN_DURATION,
          ease: 'power2.out',
          overwrite: 'auto',
        },
      );
      continue;
    }

    gsap.to(photo, {
      opacity: 0,
      duration: OUT_DURATION,
      ease: 'power1.out',
      overwrite: 'auto',
    });
  }
}

const ARROW_IN_DURATION = 0.35;
const ARROW_OUT_DURATION = 0.25;
/** How far left a hidden arrow waits, as a share of its own width. */
const ARROW_HIDDEN_X_PERCENT = -40;

/**
 * Shows the arrow after the active category and hides the others, with no
 * tween. `x: 0` clears the pixel offset GSAP reads from the CSS transform,
 * so only `xPercent` moves the arrow from here on.
 */
export function settleNavListArrows(
  gsap: GsapApi,
  arrows: readonly HTMLElement[],
  activeIndex: number,
): void {
  for (const arrow of arrows) {
    const active = photoIndex(arrow) === activeIndex;
    gsap.set(arrow, {
      opacity: active ? 1 : 0,
      x: 0,
      xPercent: active ? 0 : ARROW_HIDDEN_X_PERCENT,
      overwrite: 'auto',
    });
  }
}

/**
 * Slides the active arrow in from the left while it fades in, and the
 * previous one back out. Tweens start from wherever each arrow is, so fast
 * hovering reverses smoothly. Reduced motion shows the arrow at once.
 */
export function playNavListArrows(
  gsap: GsapApi,
  arrows: readonly HTMLElement[],
  activeIndex: number,
  reduceMotion: boolean,
): void {
  if (reduceMotion) {
    settleNavListArrows(gsap, arrows, activeIndex);
    return;
  }
  for (const arrow of arrows) {
    const active = photoIndex(arrow) === activeIndex;
    gsap.to(arrow, {
      opacity: active ? 1 : 0,
      x: 0,
      xPercent: active ? 0 : ARROW_HIDDEN_X_PERCENT,
      duration: active ? ARROW_IN_DURATION : ARROW_OUT_DURATION,
      ease: active ? 'power3.out' : 'power2.in',
      overwrite: 'auto',
    });
  }
}
