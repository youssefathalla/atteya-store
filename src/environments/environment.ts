import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  baseUrl: 'http://localhost:4200',
  googleMapsApiKey: '',
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSyApJbkIpT18TA0Qi1qNZETVFqnX3Gqm--g',
    authDomain: 'atteya-store-dev.firebaseapp.com',
    projectId: 'atteya-store-dev',
    storageBucket: 'atteya-store-dev.firebasestorage.app',
    messagingSenderId: '367756769746',
    appId: '1:367756769746:web:4f7741e4ab4058b563b00b',
    measurementId: 'G-90WCCKNBGF',
  },
  appCheck: {
    siteKey: 'RECAPTCHA_ENTERPRISE_DEV_SITE_KEY',
    isTokenAutoRefreshEnabled: true,
    debug: true,
  },
};
