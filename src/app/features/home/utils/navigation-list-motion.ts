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
