import { STOREFRONT_URL } from '../paymob/paymob-config.js';
import { currentProjectId } from '../project-id.js';
import { STORE_INFO } from '../store/store-info.js';
import { RESEND_REPLY_TO } from './email-config.js';
import type { OrderEmailContext } from './order-email-templates.js';

/** Links, photos, WhatsApp and payment details every order and return email reads. */
export function emailContext(): OrderEmailContext {
  return {
    storefrontUrl: STOREFRONT_URL.value().trim().replace(/\/+$/, ''),
    imageBaseUrl: imageKitBase(currentProjectId()),
    canReply: RESEND_REPLY_TO.value().trim().includes('@'),
    storeName: STORE_INFO.name,
    whatsappNumber: STORE_INFO.contact.whatsapp,
    instapay: STORE_INFO.payments.instapay,
    bankTransfer: STORE_INFO.payments.bankTransfer,
  };
}

/** Same ImageKit folders as `environment*.ts` (dev photos live under `/dev`). */
export function imageKitBase(projectId: string): string {
  return projectId === 'atteya-store-dev'
    ? 'https://ik.imagekit.io/atteyastore/dev'
    : 'https://ik.imagekit.io/atteyastore';
}
