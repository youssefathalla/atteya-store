import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  baseUrl: 'https://atteya-store--atteya-store-dev.europe-west4.hosted.app',
  googleMapsApiKey: '',
  firebase: {
    apiKey: 'AIzaSyApJbkIpT18TA0Qi1qNZETVFqnX3Gqm--g',
    authDomain: 'atteya-store-dev.firebaseapp.com',
    projectId: 'atteya-store-dev',
    storageBucket: 'atteya-store-dev.firebasestorage.app',
    messagingSenderId: '367756769746',
    appId: '1:367756769746:web:4f7741e4ab4058b563b00b',
    measurementId: 'G-90WCCKNBGF',
  },
  imageKitUrl: 'https://ik.imagekit.io/atteyastore/dev',
  algolia: {
    appId: 'VP2KAG5WKX',
    searchKey: '091b670aa8ed19e05eb2d7fe6a889ff4',
    indexName: 'dev_products',
    priceAscIndex: 'dev_products_price_asc',
    priceDescIndex: 'dev_products_price_desc',
  },
  appCheck: {
    siteKey: '6Lecg_4tAAAAAEDHJcAE1tWQ59-FeaHDaSUqDfQE',
    isTokenAutoRefreshEnabled: true,
    debug: false,
  },
};
