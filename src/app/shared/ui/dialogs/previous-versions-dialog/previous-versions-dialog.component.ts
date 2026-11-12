import { Component, inject, resource } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import {
  cairoDateTime,
  SettingsHistoryService,
  type SettingsHistoryDocId,
  type SettingsVersion,
} from '@core/services/settings-history';
import { SkeletonComponent } from '@shared/ui/skeleton';

export interface PreviousVersionsDialogData {
  readonly docId: SettingsHistoryDocId;
  /** What the built-in starting version is, e.g. "The menu the store came with." */
  readonly builtInHint: string;
  /** True when the page can still load this saved version (parsed with its current schema). */
  readonly canRestore: (data: unknown) => boolean;
}

/** Restore This Version closes with the version; the built-in row with `built-in`; Close with nothing. */
export type PreviousVersionsDialogResult =
  { readonly kind: 'version'; readonly version: SettingsVersion } | { readonly kind: 'built-in' };

interface VersionRow {
  readonly version: SettingsVersion;
  readonly when: string;
  readonly restorable: boolean;
}

/** Lists the earlier saved versions of Navigation or Home, newest first (ATS-251). */
@Component({
  selector: 'app-previous-versions-dialog',
  imports: [MatDialogModule, MatButtonModule, SkeletonComponent],
  host: { class: 'previous-versions-dialog' },
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">Previous Versions</h2>
    <mat-dialog-content>
      <p class="font-body-sm opacity-80 pb-3">
        Each time you publish, the version it replaces is kept here (the newest 30). Restoring opens it as a
        draft; nothing changes on the store until you publish.
      </p>

      @if (rows.isLoading()) {
        <div class="elements-start-col gap-2" aria-busy="true">
          <app-skeleton class="w-full h-16" />
          <app-skeleton class="w-full h-16" />
          <app-skeleton class="w-full h-16" />
        </div>
      } @else if (rows.error()) {
        <p class="font-body-md py-2" role="alert">
          We couldn't load the earlier versions. Close this and try again.
        </p>
      } @else {
        <ul class="elements-start-col gap-2" aria-label="Earlier versions, newest first">
          @for (row of rows.value(); track row.version.id) {
            <li class="version-row">
              <div class="min-w-0">
                <p class="font-body-md font-bold!">{{ row.when }}</p>
                <p class="font-body-sm opacity-80 wrap-break-word">
                  {{ row.version.savedByEmail ?? 'Saved by an unknown person' }}
                </p>
                @if (row.version.summary) {
                  <p class="font-body-sm opacity-80">{{ row.version.summary }}</p>
                }
              </div>
              @if (row.restorable) {
                <div class="version-row__action">
                  <button matButton="tonal" type="button" (click)="restore(row.version)">
                    Restore This Version
                  </button>
                </div>
              } @else {
                <p class="font-body-sm opacity-80">Can't restore this version</p>
              }
            </li>
          } @empty {
            <li class="font-body-md py-2">
              No earlier versions yet. They appear here after your next publish.
            </li>
          }
        </ul>
      }
      <ul class="pt-2" aria-label="Built-in version">
        <li class="version-row">
          <div class="min-w-0">
            <p class="font-body-md font-bold!">Built-in starting version</p>
            <p class="font-body-sm opacity-80">{{ data.builtInHint }}</p>
          </div>
          <div class="version-row__action">
            <button matButton="tonal" type="button" theme="error" (click)="restoreBuiltIn()">
              Restore This Version
            </button>
          </div>
        </li>
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="gap-2 px-6 pb-4">
      <div class="max-sm:w-full max-sm:[&>button]:w-full">
        <button matButton="text" type="button" [mat-dialog-close]="undefined">Close</button>
      </div>
    </mat-dialog-actions>
  `,
})
export class PreviousVersionsDialogComponent {
  readonly data = inject<PreviousVersionsDialogData>(MAT_DIALOG_DATA);
  readonly #ref =
    inject<MatDialogRef<PreviousVersionsDialogComponent, PreviousVersionsDialogResult>>(MatDialogRef);
  readonly #history = inject(SettingsHistoryService);

  readonly rows = resource({
    loader: async (): Promise<VersionRow[]> =>
      (await this.#history.list(this.data.docId)).map((version) => ({
        version,
        when: cairoDateTime(version.savedAtMs),
        restorable: this.data.canRestore(version.data),
      })),
  });

  restore(version: SettingsVersion): void {
    this.#ref.close({ kind: 'version', version });
  }

  restoreBuiltIn(): void {
    this.#ref.close({ kind: 'built-in' });
  }
}

/** Opens Previous Versions (full screen on phones). */
export async function openPreviousVersionsDialog(
  dialog: MatDialog,
  data: PreviousVersionsDialogData,
): Promise<PreviousVersionsDialogResult | null> {
  const ref = dialog.open<
    PreviousVersionsDialogComponent,
    PreviousVersionsDialogData,
    PreviousVersionsDialogResult
  >(PreviousVersionsDialogComponent, {
    data,
    width: '640px',
    maxWidth: '92vw',
    panelClass: 'previous-versions-pane',
    autoFocus: 'dialog',
  });
  return (await firstValueFrom(ref.afterClosed())) ?? null;
}
