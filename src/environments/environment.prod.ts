import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  baseUrl: 'https://your-production-domain.com',
  googleMapsApiKey: '',
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSyBuW1DM6UDFu6fBWSAnNrj6yvgq8KQ_tsg',
    authDomain: 'attiya-store.firebaseapp.com',
    projectId: 'attiya-store',
    storageBucket: 'attiya-store.firebasestorage.app',
    messagingSenderId: '391723202247',
    appId: '1:391723202247:web:9975d2e391416d5afd70e2',
    measurementId: 'G-P2LKFPB4EK',
  },
  appCheck: {
    siteKey: 'RECAPTCHA_ENTERPRISE_PROD_SITE_KEY',
    isTokenAutoRefreshEnabled: true,
    debug: false,
  },
};
