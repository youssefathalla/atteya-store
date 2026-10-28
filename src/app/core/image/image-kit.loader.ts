import { Provider } from '@angular/core';
import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { environment } from '@env/environment';
import { normalizeImageKitPath } from '@shared/utils/image';

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

/** LCP preload width for PDP main gallery (`fill` + 70vw / 40vw sizes at desktop). */
const PDP_GALLERY_LCP_WIDTH = 1080;

/** Absolute ImageKit URL for the product gallery LCP image (SSR `<link rel="preload">`). */
export function buildPdpGalleryLcpUrl(pathOrUrl: string): string {
  const src = normalizeImageKitPath(pathOrUrl);
  if (!src || src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }
  return atteyaImageKitLoader({ src, width: PDP_GALLERY_LCP_WIDTH, isPlaceholder: false });
}

export function provideAtteyaImageKitLoader(): Provider[] {
  return [{ provide: IMAGE_LOADER, useValue: atteyaImageKitLoader }];
}
