import type { FirebaseOptions } from 'firebase/app';

export interface Environment {
  production: boolean;
  baseUrl: string;
  googleMapsApiKey: string;
  useEmulators?: boolean;
  firebase: FirebaseOptions;
  appCheck?: {
    siteKey: string;
    isTokenAutoRefreshEnabled?: boolean;
    debug?: boolean;
  };
}
