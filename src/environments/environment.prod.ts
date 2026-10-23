import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  baseUrl: 'https://your-production-domain.com',
  googleMapsApiKey: '',
  firebase: {
    apiKey: 'AIzaSyBuW1DM6UDFu6fBWSAnNrj6yvgq8KQ_tsg',
    authDomain: 'attiya-store.firebaseapp.com',
    projectId: 'attiya-store',
    storageBucket: 'attiya-store.firebasestorage.app',
    messagingSenderId: '391723202247',
    appId: '1:391723202247:web:9975d2e391416d5afd70e2',
    measurementId: 'G-P2LKFPB4EK',
  },
  imageKitUrl: 'https://ik.imagekit.io/atteyastore',
  algolia: {
    appId: 'EW50BE3MCR',
    searchKey: 'e083ae4e173cbe8586b7472f87e5d592',
    indexName: 'prod_products',
    priceAscIndex: 'prod_products_price_asc',
    priceDescIndex: 'prod_products_price_desc',
  },
  appCheck: {
    siteKey: 'RECAPTCHA_ENTERPRISE_PROD_SITE_KEY',
    isTokenAutoRefreshEnabled: true,
    debug: false,
  },
};
