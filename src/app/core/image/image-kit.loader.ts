import { Provider } from '@angular/core';
import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { environment } from '@env/environment';

const IMAGEKIT_BASE = environment.imageKitUrl.endsWith('/')
  ? environment.imageKitUrl.slice(0, -1)
  : environment.imageKitUrl;

/** ImageKit loader for `NgOptimizedImage` with `tr:w-{w},q-75` (default loader omits quality). */
export function atteyaImageKitLoader(config: ImageLoaderConfig): string {
  const { src, width, height, isPlaceholder } = config;

  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  const params: string[] = [];
  if (width) {
    params.push(`w-${width}`);
  }
  if (height) {
    params.push(`h-${height}`);
  }
  if (!isPlaceholder) {
    params.push('q-75');
  }

  const urlSegments =
    params.length > 0 ? [IMAGEKIT_BASE, `tr:${params.join(',')}`, src] : [IMAGEKIT_BASE, src];
  return new URL(urlSegments.join('/')).href;
}

/**
 * `sizes` of the product page gallery photos: one photo per view below 768px,
 * one in a ~60% column up to 1279px, two side by side (~30vw each) from 1280px.
 * The first photo is `priority`, so on the server `NgOptimizedImage` adds its own
 * `<link rel="preload" as="image">` with the same `imagesrcset` and these sizes.
 */
export const PDP_GALLERY_SIZES = '(max-width: 767px) 100vw, (max-width: 1279px) 60vw, 30vw';

export function provideAtteyaImageKitLoader(): Provider[] {
  return [{ provide: IMAGE_LOADER, useValue: atteyaImageKitLoader }];
}
