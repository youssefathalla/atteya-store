/**
 * "Signed in on this device" hint (ATS-287). The server never knows who is signed in, so it
 * renders the footer email sign-up for everyone, and the footer only hides it for a signed-in
 * shopper after it hydrates. The early script in `src/index.html` reads this `localStorage` flag
 * before the first paint and sets `data-signed-in` on `<html>`, and `footer.css` hides
 * `app-footer-signup` while it is there, so a returning signed-in shopper never sees it flash.
 * The server HTML is unchanged, so hydration still matches.
 *
 * Keep the key and attribute in sync with the script in `src/index.html`.
 */
export const SIGNED_IN_HINT_KEY = 'atteya-signed-in';
export const SIGNED_IN_HINT_ATTR = 'data-signed-in';

/** Browser only: called once sign-in is known, and again on every sign-in or sign-out. */
export function syncSignedInHint(doc: Document, signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Storage blocked (private mode): the footer still hides the sign-up after it hydrates.
  }
  doc.documentElement.toggleAttribute(SIGNED_IN_HINT_ATTR, signedIn);
}
