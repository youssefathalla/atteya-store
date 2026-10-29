import type { FirebaseOptions } from 'firebase/app';

export interface Environment {
  production: boolean;
  baseUrl: string;
  googleMapsApiKey: string;
  firebase: FirebaseOptions;
  /**
   * Private Storage bucket for bank-transfer payment proofs.
   * Must not be an ImageKit web-folder origin and must not grant public IAM.
   */
  paymentProofsStorageBucket: string;
  imageKitUrl: string;
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
