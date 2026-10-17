import { signal } from '@angular/core';
import { diffOrphanedPaths, PROTECTED_STORAGE_PATHS } from '@shared/utils/image';

/**
 * Per-draft session upload tracker (instantiated inside feature draft services such as
 * `HomeDraftService` or `ProductDraftService`).
 *
 * Tracks files uploaded during the current editing session so unreferenced uploads
 * can be deleted from Firebase Storage on Publish, Discard, or Reset.
 */
export class StorageAssetTracker {
  readonly #session = signal<readonly string[]>([]);
  readonly #protectedPaths: readonly string[];

  readonly sessionPaths = this.#session.asReadonly();

  constructor(protectedPaths: readonly string[] = PROTECTED_STORAGE_PATHS) {
    this.#protectedPaths = protectedPaths;
  }

  register(path: string): void {
    const trimmed = path.trim();
    if (!trimmed) return;
    this.#session.update((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }

  clear(): void {
    this.#session.set([]);
  }

  orphansOnPublish(previousLive: readonly string[], kept: readonly string[]): string[] {
    return diffOrphanedPaths(
      [...previousLive, ...this.#session()],
      kept,
      this.#protectedPaths,
    );
  }

  orphansOnDiscard(live: readonly string[]): string[] {
    return diffOrphanedPaths(this.#session(), live, this.#protectedPaths);
  }

  orphansOnReset(live: readonly string[]): string[] {
    return diffOrphanedPaths([...live, ...this.#session()], [], this.#protectedPaths);
  }
}
