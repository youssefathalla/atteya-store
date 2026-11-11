import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

registerServiceWorker();

/** sw.js caches only hashed build files and fonts. ng serve (dev mode) runs without it and removes an old one. */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (isDevMode()) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())));
    return;
  }
  const register = () =>
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
