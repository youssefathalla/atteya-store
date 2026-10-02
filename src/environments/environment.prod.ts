import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  baseUrl: 'https://your-production-domain.com',
  googleMapsApiKey: '',
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSy-PROD-API-KEY',
    authDomain: 'atteya-store-prod.firebaseapp.com',
    projectId: 'atteya-store-prod',
    storageBucket: 'atteya-store-prod.firebasestorage.app',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  appCheck: {
    siteKey: 'RECAPTCHA_ENTERPRISE_PROD_SITE_KEY',
    isTokenAutoRefreshEnabled: true,
    debug: false,
  },
};
