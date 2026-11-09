import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { NavSettingsSchema } from './nav.schema';
import { NAVIGATION_SETTINGS_KEY, toNavigationSettingsSeed } from './navigation-settings.state';

/**
 * One server read of settings/navigation so storefront nav is in the first HTML.
 * Same client SDK path as home/shipping settings: getDoc on injectFirestore(), no App Check token.
 */
export const navigationSettingsResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;

  const transfer = inject(TransferState);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  try {
    const firestore = injectFirestore();
    const snap = await getDoc(
      doc(firestore, 'settings', 'navigation').withConverter(createValibotConverter(NavSettingsSchema)),
    );
    transfer.set(NAVIGATION_SETTINGS_KEY, snap.exists() ? toNavigationSettingsSeed(snap.data()) : null);
  } catch {
    transfer.set(NAVIGATION_SETTINGS_KEY, null);
    if (responseInit) {
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
  }
};
