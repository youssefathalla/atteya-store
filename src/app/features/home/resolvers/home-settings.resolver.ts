import { isPlatformServer } from '@angular/common';
import { inject, Injector, PLATFORM_ID, RESPONSE_INIT, TransferState } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { HomeSettingsSchema } from '../schemas/home.schema';
import { HOME_SETTINGS_KEY, toHomeSettingsSeed } from './home-settings.state';

/**
 * One server read of settings/home so the hero is in the first HTML.
 * Same client SDK path as the product page: getDoc on injectFirestore(),
 * with no App Check token (App Check stays browser-only). A failed read
 * stores null, sets no-store, and the page renders the built-in defaults.
 *
 * In the browser (client navigation to `/`) it waits for HomeService to have
 * real settings (seed, saved copy or first snapshot, at most a few seconds),
 * so the built-in hero never flashes before the saved one.
 */
export const homeSettingsResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) {
    const injector = inject(Injector);
    try {
      const { HomeService } = await import('../services/home.service');
      await injector.get(HomeService).whenReady();
    } catch {
      // Never hold up the page: it still opens and loads its settings itself.
    }
    return;
  }

  const transfer = inject(TransferState);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  try {
    const firestore = injectFirestore();
    const snap = await getDoc(
      doc(firestore, 'settings', 'home').withConverter(createValibotConverter(HomeSettingsSchema)),
    );
    transfer.set(HOME_SETTINGS_KEY, snap.exists() ? toHomeSettingsSeed(snap.data()) : null);
  } catch {
    transfer.set(HOME_SETTINGS_KEY, null);
    if (responseInit) {
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
  }
};
