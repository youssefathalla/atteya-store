import { signal } from '@angular/core';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

// 1. UTILITY TYPES (No Duplication)
export type UserSummary = Pick<User, 'id' | 'email'>;

export class UserService {
  // 2. TRUE PRIVACY (# syntax)
  readonly #state = signal<User | null>(null);

  // 3. READONLY EXPOSURE (Immutable API)
  readonly currentUser = this.#state.asReadonly();
}
