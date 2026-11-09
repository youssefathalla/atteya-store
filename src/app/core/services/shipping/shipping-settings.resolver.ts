import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { ShippingSettingsSchema } from './shipping-settings.schema';
import { SHIPPING_SETTINGS_KEY, toShippingSettingsSeed } from './shipping-settings.state';

/**
 * One server read of settings/shipping so the EGP banner line can ship in the first HTML.
 * Same client SDK path as home settings: getDoc on injectFirestore(), no App Check token.
 */
export const shippingSettingsResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;

  const transfer = inject(TransferState);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  try {
    const firestore = injectFirestore();
    const snap = await getDoc(
      doc(firestore, 'settings', 'shipping').withConverter(createValibotConverter(ShippingSettingsSchema)),
    );
    transfer.set(SHIPPING_SETTINGS_KEY, snap.exists() ? toShippingSettingsSeed(snap.data()) : null);
  } catch {
    transfer.set(SHIPPING_SETTINGS_KEY, null);
    if (responseInit) {
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
  }
};
