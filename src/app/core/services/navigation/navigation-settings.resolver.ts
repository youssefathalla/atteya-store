import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { NavSettingsSchema } from './nav.schema';
import { navNeedsBrands } from './nav-auto-columns';
import { NavAutoBrandsService } from './nav-auto-brands.service';
import { NAVIGATION_SETTINGS_KEY, toNavigationSettingsSeed } from './navigation-settings.state';

/**
 * One server read of settings/navigation so storefront nav is in the first HTML.
 * Also reads the published brands when a column fills itself with brands (ATS-247).
 * Same client SDK path as home/shipping settings: getDoc on injectFirestore(), no App Check token.
 */
export const navigationSettingsResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;

  const transfer = inject(TransferState);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  const autoBrands = inject(NavAutoBrandsService);
  try {
    const firestore = injectFirestore();
    const snap = await getDoc(
      doc(firestore, 'settings', 'navigation').withConverter(createValibotConverter(NavSettingsSchema)),
    );
    transfer.set(NAVIGATION_SETTINGS_KEY, snap.exists() ? toNavigationSettingsSeed(snap.data()) : null);
    // "All Brands" / "Newest Brands" columns (ATS-247) need the brands in the first HTML too.
    if (snap.exists() && navNeedsBrands(snap.data().categories)) await autoBrands.load();
  } catch {
    transfer.set(NAVIGATION_SETTINGS_KEY, null);
    if (responseInit) {
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
  }
};
