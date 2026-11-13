import { Service, computed, effect, inject, signal, untracked, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getRedirectResult,
  linkWithCredential,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthCredential,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, filter, firstValueFrom, map, of } from 'rxjs';
import { callableFrom, injectAuth, injectFirestore, injectFunctionsAsync } from '@core/firebase';
import { CheckoutOrderService } from '@core/services/orders/checkout-order.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { UserProfileService, type SignupConsent } from '@core/services/user-profile';
import { notifyNotAdmin } from '@features/auth/utils/login-exit';
import { AUTH_ERROR_MAPPINGS, DEFAULT_AUTH_ERROR } from './auth.errors';
import { syncSignedInHint } from './signed-in-hint';
import { AppRole, GoogleSignInOutcome, roleFromClaims } from './auth.model';
import { parseRoleMirror, RoleMirror } from './role-mirror.schema';
import {
  authErrorCode,
  isPopupFallback,
  isSessionExpired,
  readErrorEmail,
  safeReturnUrl,
} from './auth.utils';

const PASSWORD_RESET_HIDDEN_CODES = new Set(['auth/user-not-found', 'auth/invalid-credential']);

/** Set immediately before `signInWithRedirect` so other pages skip `getRedirectResult`. */
const REDIRECT_PENDING_KEY = 'atteya-auth-redirect';
/** Pages an account that still needs to agree may stay on: the terms step and what it links to. */
const CONSENT_STEP_PATHS = new Set(['/login', '/terms', '/privacy']);
/** The order confirmation page, whose Save card reports its own save. */
const ORDER_CONFIRMATION_PATH = '/checkout/confirmation/';

/** Least time between two "is the email confirmed yet?" checks on focus. */
const EMAIL_CHECK_GAP_MS = 5000;

/** Consent chosen on Create account before a Google redirect completes. */
const REDIRECT_CONSENT_KEY = 'atteya-auth-redirect-consent';

/**
 * SSR-safe sign-in state. Firebase Auth runs only in the browser.
 * `user` is set after the ID token role is known, so `waitForAuthReady()` covers both.
 *
 * The role mirror is a dynamic `roles/{uid}` listener (`rxResource` + `onSnapshot`).
 * `signalDoc` binds one document for the life of the injector, so it cannot follow a changing uid.
 */
@Service()
export class AuthService {
  readonly #auth = injectAuth();
  readonly #firestore = injectFirestore();
  readonly #profiles = inject(UserProfileService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #router = inject(Router);
  readonly #snackbar = inject(SnackbarService);
  readonly #orders = inject(CheckoutOrderService);
  readonly #functions = injectFunctionsAsync();

  readonly #user = signal<User | null>(null);
  /** Whether the signed-in account's email is confirmed (ID token `email_verified`; Google counts). */
  readonly #emailVerified = signal(false);
  readonly #role = signal<AppRole>('anon');
  readonly #isAuthReady = signal(false);
  readonly #needsGoogleLink = signal(false);
  readonly #pendingGoogleEmail = signal('');
  readonly #redirectError = signal('');
  readonly #linkingGoogle = signal(false);
  /** Signed-in shopper missing current Terms acceptance on `users/{uid}`. */
  readonly #needsConsent = signal(false);
  /**
   * False while we still need to read (or finish writing) signup consent for the
   * current uid. `leaveAfterSignIn` must hold until this is true so `/login` is
   * not left before `needsConsent` is known (Bugbot: consent hold race).
   */
  readonly #consentReady = signal(true);
  readonly #consentReady$ = toObservable(this.#consentReady);
  /** The `users/{uid}` terms read failed, so `needsConsent` is a fail-closed guess. */
  readonly #consentCheckFailed = signal(false);
  /** Bumped each time the sign-in claim links guest orders to the account. */
  readonly #guestOrdersLinked = signal(0);

  #pendingCredential: AuthCredential | null = null;
  #emailRefreshInFlight: Promise<boolean> | null = null;
  #generation = 0;
  #refreshInFlight: Promise<AppRole> | null = null;
  /** In-flight `users/{uid}` consent write so `#applyUser` does not race ahead. */
  #consentWrite: Promise<void> | null = null;
  readonly #explicitSignOut = signal(false);
  #redirectConsumed = false;
  #readyWaiters: (() => void)[] = [];

  readonly user = this.#user.asReadonly();
  readonly role = this.#role.asReadonly();
  readonly isAuthReady = this.#isAuthReady.asReadonly();
  readonly isAuthenticated = computed(() => this.#user() !== null);
  /** Admin only: the Team tab and Delete Order. */
  readonly isAdmin = computed(() => this.#role() === 'admin');
  /** Admin or staff: opens the dashboard. */
  readonly canManageStore = computed(() => this.#role() === 'admin' || this.#role() === 'staff');
  /**
   * The `signedIn` flag for offer pricing: signed in **and** the email is confirmed (Google, or a
   * confirmed email/password account). Matches the order callables, which price an unconfirmed
   * account like a guest, so offers for signed-in shoppers never show where they won't apply.
   */
  readonly offerSignedIn = computed(() => this.#user() !== null && this.#emailVerified());
  /**
   * A signed-in email/password account whose email isn't confirmed yet: the account panel and
   * `/account` show "Confirm your email" with Resend Email. Google sign-ins count as confirmed.
   */
  readonly emailNeedsConfirming = computed(() => {
    const user = this.#user();
    if (!user || this.#emailVerified()) return false;
    return user.providerData.some((provider) => provider.providerId === 'password');
  });
  readonly needsGoogleLink = this.#needsGoogleLink.asReadonly();
  readonly pendingGoogleEmail = this.#pendingGoogleEmail.asReadonly();
  readonly redirectError = this.#redirectError.asReadonly();
  readonly linkingGoogle = this.#linkingGoogle.asReadonly();
  readonly needsConsent = this.#needsConsent.asReadonly();
  readonly consentReady = this.#consentReady.asReadonly();
  /**
   * Changes after the sign-in claim (`claimGuestOrdersByEmail`) links at least one guest order,
   * so views that read an order's owner can read it again.
   */
  readonly guestOrdersLinked = this.#guestOrdersLinked.asReadonly();

  /**
   * Subscribes for the signed-in user's role mirror. Reading `value()` in the
   * constructor effect keeps the listener alive for the app session.
   */
  readonly #roleMirror = rxResource({
    params: () => this.#user()?.uid ?? '',
    stream: ({ params: uid }) => this.#watchRoleMirror(uid),
  });

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      onIdTokenChanged(this.#auth, (firebaseUser) => {
        if (!firebaseUser) {
          this.#generation += 1;
          this.#role.set('anon');
          this.#user.set(null);
          this.#needsConsent.set(false);
          this.#consentReady.set(true);
          this.#markReady();
          return;
        }

        const applyCurrent = (): void => {
          const generation = ++this.#generation;
          void this.#applyUser(this.#auth.currentUser, generation);
        };

        const inFlight = this.#refreshInFlight;
        if (inFlight) {
          void inFlight.finally(applyCurrent);
          return;
        }
        applyCurrent();
      });
      void this.#consumeRedirectResult();
    } else {
      this.#markReady();
    }

    effect(() => {
      this.#roleMirror.value();
    });

    if (isPlatformBrowser(this.#platformId)) {
      this.#keepSignedInHint();
      this.#holdUntilConsent();
      this.#claimGuestOrdersOnSignIn();
      this.#watchEmailConfirmation();
      this.#sendConfirmationOnSignIn();
    }
  }

  /**
   * Keeps the "signed in on this device" hint (`signed-in-hint.ts`, ATS-287) in step with auth once
   * it is known, so the next page load hides the footer email sign-up from the first paint.
   */
  #keepSignedInHint(): void {
    const document = inject(DOCUMENT);
    effect(() => {
      if (!this.#isAuthReady()) return;
      syncSignedInHint(document, this.isAuthenticated());
    });
  }

  /**
   * Once per sign-in (per account, per browser tab session), emails the "Confirm Your Email" message
   * to an email/password account whose email isn't confirmed yet, after the account has agreed to the
   * terms. It covers Create Account and every later Sign In, so nobody has to find the Resend Email
   * button. Silent: a refusal (for example Firebase's "wait a few minutes" or the 3-a-day limit)
   * leaves the Resend Email button in the account panel, and the next page load tries again.
   */
  #sendConfirmationOnSignIn(): void {
    const attempted = new Set<string>();
    effect(() => {
      const uid = this.#user()?.uid;
      if (!uid) {
        attempted.clear();
        // Signed out for real (not the first load before auth answers): the next sign-in asks again.
        if (this.#isAuthReady()) clearConfirmEmailStamps();
        return;
      }
      if (!this.emailNeedsConfirming() || !this.#consentReady() || this.#needsConsent()) return;
      if (attempted.has(uid) || readConfirmEmailStamp(uid)) return;
      // The order page's Save card sends its own message, with a link back to the order.
      if (untracked(() => this.#router.url).startsWith(ORDER_CONFIRMATION_PATH)) return;
      attempted.add(uid);
      untracked(
        () =>
          void this.sendVerificationEmail()
            .then((sentTo) => {
              if (sentTo) writeConfirmEmailStamp(uid);
            })
            .catch(() => undefined),
      );
    });
  }

  /**
   * Once per sign-in (per account, per browser tab session), after the account has agreed to the
   * terms and its email is known to be confirmed, links that email's earlier guest orders to the
   * account (`claimGuestOrdersByEmail`) and says how many were added (not on the order confirmation
   * page, whose Save card reports the save itself). An unconfirmed email waits
   * until it is confirmed (the server would link nothing). Browser only; a failure is silent and
   * the next change of account state, or the next page load, tries again.
   */
  #claimGuestOrdersOnSignIn(): void {
    const claimed = new Set<string>();
    effect(() => {
      const uid = this.#user()?.uid;
      if (!uid) {
        claimed.clear();
        // Signed out for real (not the first load before auth answers): a later sign-in in this
        // tab may follow a guest order, so it asks again.
        if (this.#isAuthReady()) clearGuestClaimStamps();
        return;
      }
      if (!this.#emailVerified() || !this.#consentReady() || this.#needsConsent()) return;
      if (claimed.has(uid) || readGuestClaimStamp(uid)) return;
      claimed.add(uid);
      untracked(() => void this.#claimGuestOrders(uid, claimed));
    });
  }

  async #claimGuestOrders(uid: string, claimed: Set<string>): Promise<void> {
    try {
      const linked = await this.#orders.claimGuestOrdersByEmail();
      writeGuestClaimStamp(uid);
      if (linked <= 0 || this.#auth.currentUser?.uid !== uid) return;
      // Pages that show whether an order is linked (the order page's Save card) check again.
      this.#guestOrdersLinked.update((n) => n + 1);
      // The order page's Save card already says "Saved to your account" after its own claim, so a
      // second message there would repeat it.
      const path = this.#router.url.split(/[?#]/, 1)[0] ?? '';
      if (path.startsWith(ORDER_CONFIRMATION_PATH)) return;
      this.#snackbar.success(
        linked === 1
          ? 'We added 1 earlier order to your account.'
          : `We added ${linked} earlier orders to your account.`,
      );
    } catch {
      claimed.delete(uid);
    }
  }

  /**
   * An account that has not agreed to the terms (a new Google sign-in that left the
   * "Almost done" step) is sent back to it from any page, then returned to that page.
   * Skipped when the terms check itself failed (offline): checkout and the order
   * functions still refuse such an account, but browsing is not blocked by a network error.
   */
  #holdUntilConsent(): void {
    const url = toSignal(
      this.#router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map((event): string | null => event.urlAfterRedirects),
      ),
      { initialValue: this.#router.navigated ? this.#router.url : null },
    );

    effect(() => {
      const current = url();
      if (current === null || !this.#consentReady() || !this.#needsConsent()) return;
      if (this.#consentCheckFailed()) return;
      const path = current.split(/[?#]/, 1)[0] ?? current;
      if (CONSENT_STEP_PATHS.has(path)) return;
      untracked(() => {
        void this.#router.navigate(['/login'], {
          queryParams: { returnUrl: safeReturnUrl(current) },
        });
      });
    });
  }

  async waitForAuthReady(): Promise<void> {
    if (this.#isAuthReady()) return;
    return new Promise((resolve) => {
      this.#readyWaiters.push(resolve);
    });
  }

  /**
   * Auth is ready and, for a signed-in person, `needsConsent` is known (the `users/{uid}`
   * terms check or a signup write has finished). Guards call this before reading `needsConsent`.
   */
  async waitForAccountReady(): Promise<void> {
    await this.waitForAuthReady();
    if (this.#consentReady()) return;
    await firstValueFrom(this.#consentReady$.pipe(filter(Boolean)));
  }

  async refreshRole(force = true): Promise<AppRole> {
    if (!isPlatformBrowser(this.#platformId)) return this.#role();
    await this.waitForAuthReady();
    if (!force) return this.#role();

    this.#refreshInFlight ??= this.#loadRole().finally(() => {
      this.#refreshInFlight = null;
    });
    return this.#refreshInFlight;
  }

  async login(email: string, password: string): Promise<void> {
    this.clearPendingGoogle();
    await signInWithEmailAndPassword(this.#auth, email.trim(), password);
  }

  /**
   * Email/password create-account path. Requires terms acceptance on the form.
   * Firebase may still reject when email/password sign-up is disabled on the project.
   */
  async register(email: string, password: string, consent: SignupConsent): Promise<void> {
    this.clearPendingGoogle();
    if (!consent.termsAccepted) {
      throw new Error('Accept the Terms and Conditions and Privacy Policy to create an account.');
    }
    this.#consentReady.set(false);
    let result: UserCredential;
    try {
      result = await createUserWithEmailAndPassword(this.#auth, email.trim(), password);
    } catch (error) {
      // No account was made, so no `#applyUser` will settle the flag; `waitForAccountReady` would hang.
      this.#consentReady.set(true);
      throw error;
    }
    // A failed write still settles: `#applyUser` awaits it, fails closed and sets the flag.
    await this.#writeConsent(result.user.uid, consent);
  }

  /**
   * Emails the signed-in account our own "Confirm Your Email" message (`sendVerificationEmail`
   * callable, sent through Resend; 3 per account per day). The link returns to `returnPath` (a path
   * on this site, default `/account`). Resolves with the address it went to, or null when signed
   * out, already confirmed (nothing is sent), or on the server. Throws the callable's error (show
   * it with `callableMessage()`).
   */
  async sendVerificationEmail(returnPath?: string): Promise<string | null> {
    if (!isPlatformBrowser(this.#platformId)) return null;
    const user = this.#auth.currentUser;
    if (!user) return null;
    if (user.emailVerified) {
      // Confirmed already (the account was reloaded) while the ID token may still read unconfirmed:
      // refresh it so the "Confirm your email" prompt goes away instead of Resend doing nothing.
      await this.refreshEmailVerified().catch(() => false);
      return null;
    }
    const call = await callableFrom<{ returnPath?: string }, { sent: true; email: string }>(
      this.#functions(),
      'sendVerificationEmail',
    );
    const response = await call(returnPath ? { returnPath } : {});
    return response.data?.email ?? user.email ?? null;
  }

  /**
   * Deletes the signed-in account for good (`deleteMyAccount` callable: profile, saved bag,
   * favorites, email sign-up, then the sign-in itself; past orders stay in our records), then signs
   * out on this device and returns home. Needs a sign-in from the last 10 minutes. Throws the
   * callable's error (show it with `callableMessage()`).
   */
  async deleteAccount(): Promise<void> {
    if (!isPlatformBrowser(this.#platformId) || !this.#auth.currentUser) return;
    const call = await callableFrom<Record<string, never>, { deleted: true }>(
      this.#functions(),
      'deleteMyAccount',
    );
    await call({});
    await this.logout().catch(() => undefined);
    this.#snackbar.success('Your account was deleted.');
  }

  /**
   * Reloads the signed-in account so a just-confirmed email shows as confirmed and, when the
   * ID token was minted before that, gets a fresh one so callables see `email_verified`.
   * Returns whether the email is confirmed (false when signed out). Calls made while one is
   * running share it.
   */
  async refreshEmailVerified(): Promise<boolean> {
    this.#emailRefreshInFlight ??= this.#refreshEmailVerified().finally(() => {
      this.#emailRefreshInFlight = null;
    });
    return this.#emailRefreshInFlight;
  }

  async #refreshEmailVerified(): Promise<boolean> {
    const user = this.#auth.currentUser;
    if (!user) return false;
    await user.reload();
    if (!user.emailVerified) return false;
    const token = await user.getIdTokenResult();
    if (token.claims['email_verified'] !== true) await user.getIdToken(true);
    if (this.#auth.currentUser?.uid === user.uid) this.#emailVerified.set(true);
    return true;
  }

  /**
   * While an email/password account is unconfirmed, checks again when the page opens (the
   * confirmation link lands on `/account`) and whenever the tab comes back into view, so the
   * "Confirm your email" prompt goes away and the ID token carries `email_verified`. Browser only;
   * a failed check (offline) is silent and the next one tries again.
   */
  #watchEmailConfirmation(): void {
    let lastCheck = 0;
    const check = (): void => {
      if (!untracked(this.emailNeedsConfirming)) return;
      // Coming back to the tab fires both visibilitychange and focus; one check is enough.
      const now = Date.now();
      if (now - lastCheck < EMAIL_CHECK_GAP_MS) return;
      lastCheck = now;
      void this.refreshEmailVerified().catch(() => false);
    };
    let checkedUid: string | null = null;
    effect(() => {
      const uid = this.emailNeedsConfirming() ? (this.#user()?.uid ?? null) : null;
      if (!uid || uid === checkedUid) return;
      checkedUid = uid;
      untracked(check);
    });
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (globalThis.document.visibilityState === 'visible') check();
    });
    globalThis.addEventListener?.('focus', check);
  }

  /**
   * Popup first. A blocked popup falls back to a full-page redirect.
   * `@gmail.com` accounts attach to the existing user under "one account per email".
   * Other addresses that already have a password return `'link'` so the page can ask for it.
   * Pass `consent` on Create account so a brand-new Google user gets a profile write.
   */
  async loginWithGoogle(consent?: SignupConsent): Promise<GoogleSignInOutcome> {
    this.clearPendingGoogle();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Hold leave-after-sign-in until `#afterCredential` / `#applyUser` finish the profile check.
    this.#consentReady.set(false);
    try {
      const result = await signInWithPopup(this.#auth, provider, browserPopupRedirectResolver);
      await this.#afterCredential(result, consent);
      return 'popup';
    } catch (error) {
      this.#consentReady.set(true);
      if (isPopupFallback(error)) {
        this.#consentReady.set(false);
        this.#markRedirectPending(consent);
        try {
          await signInWithRedirect(this.#auth, provider, browserPopupRedirectResolver);
        } catch (redirectError) {
          this.#clearRedirectPending();
          this.#consentReady.set(true);
          throw redirectError;
        }
        return 'redirect';
      }
      if (this.#captureAccountExists(error)) return 'link';
      throw error;
    }
  }

  async linkPendingGoogle(email: string, password: string): Promise<void> {
    const pending = this.#pendingCredential;
    const target = (email || this.#pendingGoogleEmail()).trim();
    if (!pending || !target) {
      throw new Error('Enter the password for this email to connect Google.');
    }

    this.#linkingGoogle.set(true);
    try {
      const credential = await signInWithEmailAndPassword(this.#auth, target, password);
      try {
        await linkWithCredential(credential.user, pending);
      } catch (error) {
        if (authErrorCode(error) !== 'auth/provider-already-linked') throw error;
      }
      this.clearPendingGoogle();
    } finally {
      this.#linkingGoogle.set(false);
    }
  }

  /** Completes Terms + marketing choice for a signed-in user missing `users/{uid}` consent. */
  async completeConsent(consent: SignupConsent): Promise<void> {
    const uid = this.#user()?.uid;
    if (!uid) {
      throw new Error('Sign in first, then accept the Terms and Conditions.');
    }
    if (!consent.termsAccepted) {
      throw new Error('Accept the Terms and Conditions and Privacy Policy to continue.');
    }
    this.#consentReady.set(false);
    try {
      await this.#writeConsent(uid, consent);
    } finally {
      this.#consentReady.set(true);
    }
  }

  clearPendingGoogle(): void {
    this.#pendingCredential = null;
    this.#needsGoogleLink.set(false);
    this.#pendingGoogleEmail.set('');
  }

  clearRedirectError(): void {
    this.#redirectError.set('');
  }

  async logout(): Promise<void> {
    this.#explicitSignOut.set(true);
    this.clearPendingGoogle();
    this.#needsConsent.set(false);
    this.#consentReady.set(true);
    this.#role.set('anon');
    this.#user.set(null);
    try {
      await signOut(this.#auth);
      this.#snackbar.info('Signed out');
      await this.#router.navigateByUrl('/');
    } finally {
      this.#explicitSignOut.set(false);
    }
  }

  /**
   * Same outcome whether or not the email exists, so the page can stay quiet about that.
   * Invalid addresses and network problems still throw.
   */
  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.#auth, email.trim());
    } catch (error) {
      if (PASSWORD_RESET_HIDDEN_CODES.has(authErrorCode(error))) return;
      throw error;
    }
  }

  /**
   * After a rejected admin write: refresh the claim. A signed-in person who is
   * no longer an admin goes home. A signed-out person goes to sign in.
   */
  async redirectIfNoLongerAdmin(returnUrl: string): Promise<void> {
    await this.refreshRole(true);
    if (this.canManageStore()) return;
    if (!this.isAuthenticated()) {
      await this.#router.navigate(['/login'], {
        queryParams: { returnUrl: safeReturnUrl(returnUrl) },
      });
      return;
    }
    notifyNotAdmin(this.#snackbar);
    await this.#router.navigateByUrl('/');
  }

  /**
   * While the admin shell is open, leave if the person signs out or loses admin.
   * Call once from the admin layout so the effect is destroyed with that page.
   */
  watchAdminAccess(): void {
    effect(() => {
      const ready = this.isAuthReady();
      const signedIn = this.isAuthenticated();
      const admin = this.canManageStore();
      const explicitSignOut = this.#explicitSignOut();
      if (!ready || !isPlatformBrowser(this.#platformId)) return;

      untracked(() => {
        const url = this.#router.url;
        if (!url.startsWith('/admin') || explicitSignOut) return;
        if (!signedIn) {
          void this.#router.navigate(['/login'], {
            queryParams: { returnUrl: safeReturnUrl(url) },
          });
          return;
        }
        if (!admin) {
          notifyNotAdmin(this.#snackbar);
          void this.#router.navigateByUrl('/');
        }
      });
    });
  }

  mapFirebaseError(error: unknown): string {
    const code = authErrorCode(error);
    if (code) return AUTH_ERROR_MAPPINGS[code] ?? DEFAULT_AUTH_ERROR;
    if (error instanceof Error) {
      if (error.message.startsWith('Enter the password')) return error.message;
      if (error.message.startsWith('Accept the Terms')) return error.message;
      if (error.message.startsWith('Sign in first')) return error.message;
    }
    return DEFAULT_AUTH_ERROR;
  }

  #watchRoleMirror(uid: string): Observable<RoleMirror | null> {
    if (!uid || !isPlatformBrowser(this.#platformId)) return of(null);

    return new Observable((subscriber) => {
      const unsubscribe = onSnapshot(
        doc(this.#firestore, 'roles', uid),
        (snapshot) => {
          const mirror = snapshot.exists() ? parseRoleMirror(snapshot.data()) : null;
          subscriber.next(mirror);
          const tokenRole = this.#role();
          if (!mirror || tokenRole === 'anon' || mirror.role === tokenRole) return;
          void this.refreshRole(true);
        },
        () => subscriber.next(null),
      );
      return unsubscribe;
    });
  }

  async #applyUser(firebaseUser: User | null, generation: number): Promise<void> {
    if (!firebaseUser) {
      if (generation !== this.#generation) return;
      this.#role.set('anon');
      this.#user.set(null);
      this.#needsConsent.set(false);
      this.#consentReady.set(true);
      this.#markReady();
      return;
    }

    this.#consentReady.set(false);
    try {
      try {
        const result = await firebaseUser.getIdTokenResult();
        if (generation !== this.#generation) return;
        this.#role.set(roleFromClaims(result.claims));
        this.#emailVerified.set(result.claims['email_verified'] === true);
        this.#user.set(firebaseUser);
        this.#markReady();
      } catch (error) {
        if (generation !== this.#generation) return;
        if (isSessionExpired(error)) {
          await signOut(this.#auth).catch(() => undefined);
          this.#role.set('anon');
          this.#user.set(null);
          this.#needsConsent.set(false);
          this.#consentReady.set(true);
          this.#markReady();
          return;
        }
        this.#role.set('user');
        // The server reads `email_verified` from the token only; unknown here, so price like a guest.
        this.#emailVerified.set(false);
        this.#user.set(firebaseUser);
        this.#markReady();
      }

      // Wait for any in-flight signup write, then read the profile (survives reload).
      if (this.#consentWrite) await this.#consentWrite;
      if (generation !== this.#generation) return;
      const hasTerms = await this.#profiles.hasCurrentTerms(firebaseUser.uid);
      if (generation !== this.#generation) return;
      this.#consentCheckFailed.set(false);
      this.#needsConsent.set(!hasTerms);
      this.#consentReady.set(true);
    } catch {
      if (generation !== this.#generation) return;
      // Fail closed: keep the shopper on consent until we can confirm Terms.
      this.#consentCheckFailed.set(true);
      this.#needsConsent.set(true);
      this.#consentReady.set(true);
    }
  }

  async #loadRole(): Promise<AppRole> {
    const current = this.#auth.currentUser;
    if (!current) {
      this.#role.set('anon');
      this.#user.set(null);
      this.#needsConsent.set(false);
      this.#consentReady.set(true);
      return 'anon';
    }

    try {
      const result = await current.getIdTokenResult(true);
      if (this.#auth.currentUser?.uid !== current.uid) return this.#role();
      const role = roleFromClaims(result.claims);
      this.#role.set(role);
      this.#emailVerified.set(result.claims['email_verified'] === true);
      this.#user.set(current);
      return role;
    } catch (error) {
      if (authErrorCode(error) === 'auth/network-request-failed') return this.#role();
      if (isSessionExpired(error)) {
        await signOut(this.#auth).catch(() => undefined);
        this.#role.set('anon');
        this.#user.set(null);
        this.#needsConsent.set(false);
        this.#consentReady.set(true);
        return 'anon';
      }
      return this.#role();
    }
  }

  async #afterCredential(result: UserCredential, consent?: SignupConsent): Promise<void> {
    const info = getAdditionalUserInfo(result);
    if (consent?.termsAccepted && info?.isNewUser) {
      await this.#writeConsent(result.user.uid, consent);
      return;
    }
    // Profile check (and needsConsent) is owned by `#applyUser` so reloads stay consistent.
  }

  async #writeConsent(uid: string, consent: SignupConsent): Promise<void> {
    const write = this.#profiles
      .writeSignupConsent(uid, consent)
      .then(() => {
        this.#needsConsent.set(false);
      })
      .finally(() => {
        if (this.#consentWrite === write) this.#consentWrite = null;
      });
    this.#consentWrite = write;
    await write;
  }

  async #consumeRedirectResult(): Promise<void> {
    if (this.#redirectConsumed) return;
    this.#redirectConsumed = true;

    const onLogin = globalThis.location?.pathname === '/login';
    if (!this.#redirectPending() && !onLogin) return;

    const consent = this.#readRedirectConsent();
    try {
      const result = await getRedirectResult(this.#auth, browserPopupRedirectResolver);
      if (result) await this.#afterCredential(result, consent ?? undefined);
    } catch (error) {
      if (this.#captureAccountExists(error)) return;
      this.#redirectError.set(this.mapFirebaseError(error));
    } finally {
      this.#clearRedirectPending();
    }
  }

  #redirectPending(): boolean {
    try {
      return sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1';
    } catch {
      return false;
    }
  }

  #markRedirectPending(consent?: SignupConsent): void {
    try {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
      if (consent?.termsAccepted) {
        sessionStorage.setItem(
          REDIRECT_CONSENT_KEY,
          JSON.stringify({
            termsAccepted: true,
            marketingOptIn: consent.marketingOptIn === true,
          }),
        );
      } else {
        sessionStorage.removeItem(REDIRECT_CONSENT_KEY);
      }
    } catch {
      // Private mode can block storage. `/login` still checks the redirect result.
    }
  }

  #readRedirectConsent(): SignupConsent | null {
    try {
      const raw = sessionStorage.getItem(REDIRECT_CONSENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      const termsAccepted = 'termsAccepted' in parsed && parsed.termsAccepted === true;
      if (!termsAccepted) return null;
      const marketingOptIn = 'marketingOptIn' in parsed && parsed.marketingOptIn === true;
      return { termsAccepted: true, marketingOptIn };
    } catch {
      return null;
    }
  }

  #clearRedirectPending(): void {
    try {
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      sessionStorage.removeItem(REDIRECT_CONSENT_KEY);
    } catch {
      // Ignore blocked storage.
    }
  }

  #captureAccountExists(error: unknown): boolean {
    if (!(error instanceof FirebaseError)) return false;
    if (error.code !== 'auth/account-exists-with-different-credential') return false;
    const credential = GoogleAuthProvider.credentialFromError(error);
    if (!credential) return false;
    this.#pendingCredential = credential;
    this.#pendingGoogleEmail.set(readErrorEmail(error));
    this.#needsGoogleLink.set(true);
    return true;
  }

  #markReady(): void {
    this.#isAuthReady.set(true);
    const waiters = this.#readyWaiters;
    this.#readyWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

/** `sessionStorage` key saying this tab already linked the account's guest orders. */
const GUEST_CLAIM_STAMP = 'atteya-guest-orders-claimed:';

function readGuestClaimStamp(uid: string): boolean {
  try {
    return sessionStorage.getItem(GUEST_CLAIM_STAMP + uid) === '1';
  } catch {
    return false;
  }
}

function writeGuestClaimStamp(uid: string): void {
  try {
    sessionStorage.setItem(GUEST_CLAIM_STAMP + uid, '1');
  } catch {
    // Storage blocked: the next page load asks again, which is harmless.
  }
}

/** `sessionStorage` key saying this tab already sent the account its "Confirm Your Email" message. */
const CONFIRM_EMAIL_STAMP = 'atteya-confirm-email-sent:';

function readConfirmEmailStamp(uid: string): boolean {
  try {
    return sessionStorage.getItem(CONFIRM_EMAIL_STAMP + uid) === '1';
  } catch {
    return false;
  }
}

function writeConfirmEmailStamp(uid: string): void {
  try {
    sessionStorage.setItem(CONFIRM_EMAIL_STAMP + uid, '1');
  } catch {
    // Storage blocked: the next page load asks again, which the server's daily limit keeps small.
  }
}

function clearConfirmEmailStamps(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CONFIRM_EMAIL_STAMP)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was stamped.
  }
}

function clearGuestClaimStamps(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(GUEST_CLAIM_STAMP)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was stamped.
  }
}
