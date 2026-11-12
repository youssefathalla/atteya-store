import { DOCUMENT } from '@angular/common';
import { Service, inject, untracked } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { PRIMARY_OUTLET, Router } from '@angular/router';
import { environment } from '@env/environment';
import { buildImageKitUrl } from '@shared/utils/image';
import { SeoMetadata } from './seo.model';
import {
  SEO_DEFAULT_IMAGE_PATH,
  SEO_IMAGE_WIDTH,
  SEO_SITE_NAME,
  canonicalUrl,
  shareText,
  siteOrigin,
} from './seo-urls';

/** Share-preview tags written with `property="…"` (Open Graph). */
const OG_PROPERTIES = [
  'og:title',
  'og:description',
  'og:url',
  'og:type',
  'og:site_name',
  'og:image',
] as const;

@Service()
export class SeoService {
  readonly #title = inject(Title);
  readonly #meta = inject(Meta);
  readonly #document = inject(DOCUMENT);
  readonly #router = inject(Router);

  setTitle(title: string): void {
    this.#title.setTitle(title);
  }

  updateTag(tag: { name: string; content: string }): void {
    this.#meta.updateTag(tag);
  }

  setPageMetadata(config: SeoMetadata): void {
    const noindex = config.noindex === true;
    this.setTitle(config.title);
    this.updateTag({ name: 'description', content: config.description });
    this.#setRobots(noindex);

    // Pages call this from effects too; reading the router must not make them track it.
    const canonical = noindex || config.canonical === false ? null : untracked(() => this.#canonicalUrl());
    this.#setCanonical(canonical);
    if (noindex) {
      this.#removeShareTags();
    } else {
      this.#setShareTags(config, canonical);
    }
  }

  /**
   * Robots is written on every call, not only when noindex is set, so navigating
   * from a noindexed landing page to an indexable page clears the directive
   * instead of leaving it stuck on.
   */
  #setRobots(noindex: boolean): void {
    this.updateTag({ name: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow' });
  }

  /**
   * The current route. The router sets its URL before it creates the new page, so
   * `ngOnInit()` (server and browser) and later effects all read the page's own URL.
   */
  #canonicalUrl(): string {
    const tree = this.#router.parseUrl(this.#router.url);
    const segments = tree.root.children[PRIMARY_OUTLET]?.segments.map((segment) => segment.path) ?? [];
    return canonicalUrl(environment.baseUrl, segments);
  }

  /** Exactly one canonical link while a page has one; none otherwise. */
  #setCanonical(href: string | null): void {
    const head = this.#document.head;
    const links = Array.from(head.querySelectorAll('link[rel="canonical"]'));
    if (href === null) {
      links.forEach((link) => link.remove());
      return;
    }
    const [first, ...extra] = links;
    extra.forEach((link) => link.remove());
    const link = first ?? this.#document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', href);
    if (!first) head.appendChild(link);
  }

  #setShareTags(config: SeoMetadata, url: string | null): void {
    const description = shareText(config.shareDescription?.trim() || config.description);
    this.#setProperty('og:title', config.title);
    this.#setProperty('og:description', description);
    this.#setProperty('og:type', config.type ?? 'website');
    this.#setProperty('og:site_name', SEO_SITE_NAME);
    this.#setProperty('og:image', this.#shareImage(config.image));
    if (url) this.#setProperty('og:url', url);
    else this.#meta.removeTag('property="og:url"');
    this.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
  }

  #removeShareTags(): void {
    for (const property of OG_PROPERTIES) this.#meta.removeTag(`property="${property}"`);
    this.#meta.removeTag('name="twitter:card"');
  }

  #setProperty(property: string, content: string): void {
    this.#meta.updateTag({ property, content }, `property="${property}"`);
  }

  /** A product photo through ImageKit at 1200 px, else the default photo from `public/`. */
  #shareImage(image: string | null | undefined): string {
    const path = image?.trim();
    const url = path ? buildImageKitUrl(path, { w: SEO_IMAGE_WIDTH }) : '';
    if (url.startsWith('https://')) return url;
    return `${siteOrigin(environment.baseUrl)}${SEO_DEFAULT_IMAGE_PATH}`;
  }
}
