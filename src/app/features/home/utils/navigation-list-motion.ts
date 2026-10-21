import type { gsap as GsapNamespace } from 'gsap';

type GsapApi = typeof GsapNamespace;

const OUT_DURATION = 0.35;
const IN_DURATION = 0.5;

function photoIndex(photo: HTMLElement): number {
  const raw = photo.dataset['navIndex'];
  const index = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(index) ? index : -1;
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
