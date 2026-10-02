import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  baseUrl: 'http://localhost:4200',
  googleMapsApiKey: '',
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSy-DEV-API-KEY',
    authDomain: 'atteya-store-dev.firebaseapp.com',
    projectId: 'atteya-store-dev',
    storageBucket: 'atteya-store-dev.firebasestorage.app',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  appCheck: {
    siteKey: 'RECAPTCHA_ENTERPRISE_DEV_SITE_KEY',
    isTokenAutoRefreshEnabled: true,
    debug: true,
  },
};
