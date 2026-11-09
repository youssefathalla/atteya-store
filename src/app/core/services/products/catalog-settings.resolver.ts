import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CATALOG_DOC } from './product.constants';
import { CATALOG_SETTINGS_KEY, toCatalogSettingsSeed } from './catalog-settings.state';

/**
 * One server read of settings/catalog so storefront nav visibility matches the first HTML.
 * Same client SDK path as navigation/shipping: getDoc on injectFirestore(), no App Check token.
 */
export const catalogSettingsResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;

  const transfer = inject(TransferState);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  try {
    const firestore = injectFirestore();
    const snap = await getDoc(doc(firestore, CATALOG_DOC[0], CATALOG_DOC[1]));
    transfer.set(CATALOG_SETTINGS_KEY, snap.exists() ? toCatalogSettingsSeed(snap.data()) : null);
  } catch {
    transfer.set(CATALOG_SETTINGS_KEY, null);
    if (responseInit) {
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
  }
};
