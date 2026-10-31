import { Service, computed, effect, inject, signal, untracked, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
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
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { injectAuth, injectFirestore } from '@core/firebase';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { notifyNotAdmin } from '@features/auth/utils/login-exit';
import { AUTH_ERROR_MAPPINGS, DEFAULT_AUTH_ERROR } from './auth.errors';
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
  readonly #platformId = inject(PLATFORM_ID);
  readonly #router = inject(Router);
  readonly #snackbar = inject(SnackbarService);

  readonly #user = signal<User | null>(null);
  readonly #role = signal<AppRole>('anon');
  readonly #isAuthReady = signal(false);
  readonly #needsGoogleLink = signal(false);
  readonly #pendingGoogleEmail = signal('');
  readonly #redirectError = signal('');
  readonly #linkingGoogle = signal(false);

  #pendingCredential: AuthCredential | null = null;
  #generation = 0;
  #refreshInFlight: Promise<AppRole> | null = null;
  readonly #explicitSignOut = signal(false);
  #redirectConsumed = false;
  #readyWaiters: (() => void)[] = [];

  readonly user = this.#user.asReadonly();
  readonly role = this.#role.asReadonly();
  readonly isAuthReady = this.#isAuthReady.asReadonly();
  readonly isAuthenticated = computed(() => this.#user() !== null);
  readonly isAdmin = computed(() => this.#role() === 'admin');
  readonly needsGoogleLink = this.#needsGoogleLink.asReadonly();
  readonly pendingGoogleEmail = this.#pendingGoogleEmail.asReadonly();
  readonly redirectError = this.#redirectError.asReadonly();
  readonly linkingGoogle = this.#linkingGoogle.asReadonly();

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
  }

  async waitForAuthReady(): Promise<void> {
    if (this.#isAuthReady()) return;
    return new Promise((resolve) => {
      this.#readyWaiters.push(resolve);
    });
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
   * Popup first. Blocked popups and popup/handler transport failures fall back to redirect.
   * `@gmail.com` accounts attach to the existing user under "one account per email".
   * Other addresses that already have a password return `'link'` so the page can ask for it.
   */
  async loginWithGoogle(): Promise<GoogleSignInOutcome> {
    this.clearPendingGoogle();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(this.#auth, provider, browserPopupRedirectResolver);
      return 'popup';
    } catch (error) {
      if (isPopupFallback(error)) {
        this.#markRedirectPending();
        try {
          await signInWithRedirect(this.#auth, provider, browserPopupRedirectResolver);
        } catch (redirectError) {
          this.#clearRedirectPending();
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
    if (this.isAdmin()) return;
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
      const admin = this.isAdmin();
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
    if (error instanceof Error && error.message.startsWith('Enter the password')) return error.message;
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
      this.#markReady();
      return;
    }

    try {
      const result = await firebaseUser.getIdTokenResult();
      if (generation !== this.#generation) return;
      this.#role.set(roleFromClaims(result.claims));
      this.#user.set(firebaseUser);
      this.#markReady();
    } catch (error) {
      if (generation !== this.#generation) return;
      if (isSessionExpired(error)) {
        await signOut(this.#auth).catch(() => undefined);
        this.#role.set('anon');
        this.#user.set(null);
        this.#markReady();
        return;
      }
      this.#role.set('user');
      this.#user.set(firebaseUser);
      this.#markReady();
    }
  }

  async #loadRole(): Promise<AppRole> {
    const current = this.#auth.currentUser;
    if (!current) {
      this.#role.set('anon');
      this.#user.set(null);
      return 'anon';
    }

    try {
      const result = await current.getIdTokenResult(true);
      if (this.#auth.currentUser?.uid !== current.uid) return this.#role();
      const role = roleFromClaims(result.claims);
      this.#role.set(role);
      this.#user.set(current);
      return role;
    } catch (error) {
      if (authErrorCode(error) === 'auth/network-request-failed') return this.#role();
      if (isSessionExpired(error)) {
        await signOut(this.#auth).catch(() => undefined);
        this.#role.set('anon');
        this.#user.set(null);
        return 'anon';
      }
      return this.#role();
    }
  }

  async #consumeRedirectResult(): Promise<void> {
    if (this.#redirectConsumed) return;
    this.#redirectConsumed = true;

    const onLogin = globalThis.location?.pathname === '/login';
    if (!this.#redirectPending() && !onLogin) return;

    try {
      await getRedirectResult(this.#auth, browserPopupRedirectResolver);
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

  #markRedirectPending(): void {
    try {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
    } catch {
      // Private mode can block storage. `/login` still checks the redirect result.
    }
  }

  #clearRedirectPending(): void {
    try {
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
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
