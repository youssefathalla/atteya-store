import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { importImageFromUrl } from './import-image.fn.js';
export { migrateCatalogStructure } from './products/migrate-catalog.fn.js';
export { setProductStock } from './products/set-product-stock.fn.js';
export { setProductPublished } from './products/set-product-published.fn.js';
export { deleteProduct } from './products/delete-product.fn.js';
export { productWeights } from './products/product-weights.fn.js';
export {
  deleteBrand,
  deleteCategory,
  reorderCatalog,
  saveBrand,
  saveCategory,
} from './products/catalog-admin.fn.js';
export { createProduct, updateProduct } from './products/product-form.fn.js';
export { getProductModel, saveProductModel } from './products/product-model.fn.js';
export { onProductCountsChange } from './products/product-counts.trigger.js';
export { onProductColorSiblingsChange } from './products/color-siblings.trigger.js';
export { onOfferWritten } from './offers/on-offer-written.trigger.js';
export { refreshOfferPricing } from './offers/refresh-offer-pricing.schedule.js';
export { listAdmins, setUserRole } from './roles/roles.fn.js';
export { reindexSearch } from './search/reindex.fn.js';
export { syncProductSearch } from './search/sync-product.trigger.js';
export { onShippingSettingsWritten } from './shipping/on-shipping-settings-written.trigger.js';
export { refreshExchangeRates } from './intl/refresh-exchange-rates.schedule.js';
export { refreshExchangeRatesNow, setInternationalPricing } from './intl/intl-pricing.fn.js';
export { createPaymobOrder } from './orders/create-paymob-order.fn.js';
export {
  createBankTransferOrder,
  createCodOrder,
  createInstapayOrder,
} from './orders/create-manual-order.fn.js';
export { confirmCodOrder } from './orders/confirm-cod-order.fn.js';
export { cancelOrder } from './orders/cancel-order.fn.js';
export { deleteOrder } from './orders/delete-order.fn.js';
export { setOrderStatus } from './orders/set-order-status.fn.js';
export { setDeliveryFee } from './orders/set-delivery-fee.fn.js';
export { paymobWebhook } from './orders/paymob-webhook.fn.js';
export { claimOrder } from './orders/claim-order.fn.js';
export { claimGuestOrdersByEmail } from './orders/claim-guest-orders.fn.js';
export { sendVerificationEmail } from './auth/send-verification-email.fn.js';
export { deleteMyAccount } from './auth/delete-account.fn.js';
export { syncOrderView } from './orders/order-view.trigger.js';
export { sendOrderEmails } from './email/send-order-emails.trigger.js';
export { subscribeToEmails } from './marketing/subscribe-to-emails.fn.js';
export { onSettingsHistoryWrite } from './settings/settings-history.trigger.js';
