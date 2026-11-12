export type SeoPageType = 'website' | 'product';

export interface SeoMetadata {
  readonly title: string;
  readonly description: string;
  /**
   * Keeps the page out of search. A noindex page also gets no canonical link and
   * no share-preview tags.
   */
  readonly noindex?: boolean;
  /**
   * Share-preview photo: a storage path or our own image URL, sent through
   * ImageKit at 1200 px wide. Defaults to the store's hero photo in `public/`.
   */
  readonly image?: string | null;
  /** `og:type`. Defaults to `website`; product pages pass `product`. */
  readonly type?: SeoPageType;
  /** Text for `og:description` when it should differ from the page description. */
  readonly shareDescription?: string | null;
  /**
   * Writes `<link rel="canonical">` and `og:url` from `environment.baseUrl` plus the
   * route path (no query string). Defaults to true; pages such as search turn it off.
   */
  readonly canonical?: boolean;
}
