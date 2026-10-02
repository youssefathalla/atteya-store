import { Service, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  User,
  UserCredential,
} from 'firebase/auth';
import { injectAuth } from '@core/firebase/firebase.tokens';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { AUTH_ERROR_MAPPINGS, DEFAULT_AUTH_ERROR } from './auth.errors';

@Service()
export class AuthService {
  readonly #auth = injectAuth();
  readonly #platformId = inject(PLATFORM_ID);
  readonly #router = inject(Router);
  readonly #snackbar = inject(SnackbarService);

  /**
   * Current authenticated user state:
   * - `undefined`: Initializing (checking session token)
   * - `null`: Unauthenticated (guest)
   * - `User`: Authenticated
   */
  readonly user = signal<User | null | undefined>(undefined);
  readonly currentUser = computed(() => this.user() ?? null);
  readonly isAuthenticated = computed(() => !!this.user());
  readonly isAuthReady = computed(() => this.user() !== undefined);
  readonly emailVerified = computed(() => this.user()?.emailVerified ?? false);

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      onAuthStateChanged(this.#auth, (firebaseUser) => {
        this.user.set(firebaseUser);
      });
    } else {
      // In SSR / Prerender, resolve immediately to unauthenticated guest
      this.user.set(null);
    }
  }

  /** Resolves when Firebase Auth has finished its initial state check. */
  async waitForAuthReady(): Promise<void> {
    if (this.isAuthReady()) return;

    return new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(this.#auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }

  async login(email: string, pass: string): Promise<UserCredential> {
    try {
      const cred = await signInWithEmailAndPassword(this.#auth, email, pass);
      this.#snackbar.success('Logged in successfully');
      return cred;
    } catch (error) {
      this.#snackbar.error(this.mapFirebaseError(error));
      throw error;
    }
  }

  async register(email: string, pass: string): Promise<UserCredential> {
    try {
      const cred = await createUserWithEmailAndPassword(this.#auth, email, pass);
      await sendEmailVerification(cred.user);
      this.#snackbar.success('Account created! Verification email sent.');
      return cred;
    } catch (error) {
      this.#snackbar.error(this.mapFirebaseError(error));
      throw error;
    }
  }

  async logout(): Promise<void> {
    await signOut(this.#auth);
    this.#snackbar.info('Signed out');
    await this.#router.navigate(['/']);
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.#auth, email);
      this.#snackbar.success('Password reset email sent');
    } catch (error) {
      this.#snackbar.error(this.mapFirebaseError(error));
      throw error;
    }
  }

  mapFirebaseError(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      return AUTH_ERROR_MAPPINGS[code] ?? DEFAULT_AUTH_ERROR;
    }
    return DEFAULT_AUTH_ERROR;
  }
}
