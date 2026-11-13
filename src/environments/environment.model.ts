import type { FirebaseOptions } from 'firebase/app';

export interface Environment {
  production: boolean;
  baseUrl: string;
  googleMapsApiKey: string;
  firebase: FirebaseOptions;
  imageKitUrl: string;
  /** Meta (Facebook) Pixel id for the client's ads (ATS-290). Live store only; empty on dev. */
  metaPixelId?: string;
  algolia: {
    appId: string;
    searchKey: string;
    indexName: string;
    priceAscIndex: string;
    priceDescIndex: string;
  };
  appCheck?: {
    siteKey: string;
    isTokenAutoRefreshEnabled?: boolean;
    debug?: boolean;
  };
}
