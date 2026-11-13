import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth/auth.service';
import { CUSTOMER_NOTE_MAX_LENGTH, type CustomerNote } from '@core/services/customers';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { CustomersAdminService } from '../../../services/customers-admin.service';
import { noteChangedLine } from '../../utils/customer-details.utils';

/** The Staff Note card on the customer page (ATS-278): `customerNotes/{customerId}`, staff only. */
@Component({
  selector: 'app-customer-note-card',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, SkeletonComponent],
  template: `
    <section
      class="surface-card p-6 elements-start-col items-stretch! gap-5"
      aria-labelledby="customer-note-title"
    >
      <div class="elements-start-col gap-1">
        <h2 id="customer-note-title" class="font-title-md font-bold!">Staff Note</h2>
        <p class="font-body-sm text-on-surface-variant">Only staff see this.</p>
      </div>

      @if (noteResource.isLoading() && !noteResource.hasValue()) {
        <app-skeleton class="h-32 w-full" />
      } @else if (noteResource.status() === 'error') {
        <div class="grid gap-3 justify-items-start" role="alert">
          <p class="font-body-md">We couldn't load the note.</p>
          <button matButton="outlined" type="button" (click)="noteResource.reload()">Try Again</button>
        </div>
      } @else {
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Note</mat-label>
          <textarea
            matInput
            rows="5"
            dir="auto"
            [attr.maxlength]="maxLength"
            [value]="draft()"
            (input)="onInput($event)"
          ></textarea>
          <mat-hint align="end">{{ draft().length }}/{{ maxLength }}</mat-hint>
        </mat-form-field>

        <div class="grid gap-3 @3xl:justify-items-start">
          <button
            matButton="filled"
            type="button"
            [disabled]="isSaving() || !changed()"
            [attr.aria-label]="isSaving() ? 'Saving note' : null"
            (click)="save()"
          >
            @if (isSaving()) {
              <mat-progress-spinner mode="indeterminate" diameter="18" />
            } @else {
              <span>Save Note</span>
            }
          </button>
          @if (changedLine(); as line) {
            <p class="font-body-sm text-on-surface-variant break-words">{{ line }}</p>
          }
        </div>
      }
    </section>
  `,
})
export class CustomerNoteCardComponent {
  readonly #customersAdmin = inject(CustomersAdminService);
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly customerId = input.required<string>();

  readonly maxLength = CUSTOMER_NOTE_MAX_LENGTH;

  readonly noteResource = resource({
    params: () => ({ id: this.customerId() }),
    loader: async ({ params }): Promise<CustomerNote | null> =>
      this.#browser ? this.#customersAdmin.getNote(params.id) : null,
  });

  readonly #saved = computed(() =>
    this.noteResource.hasValue() ? (this.noteResource.value()?.note ?? '') : '',
  );

  /** The textarea; starts from the saved note and follows it after each save. */
  readonly draft = linkedSignal(() => this.#saved());

  readonly changed = computed(() => this.draft() !== this.#saved());

  readonly changedLine = computed(() =>
    noteChangedLine(this.noteResource.hasValue() ? (this.noteResource.value() ?? null) : null),
  );

  readonly isSaving = signal(false);

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value.slice(0, CUSTOMER_NOTE_MAX_LENGTH));
  }

  async save(): Promise<void> {
    const user = this.#auth.user();
    if (!user || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.#customersAdmin.saveNote(this.customerId(), this.draft(), user.uid, user.email ?? '');
      this.noteResource.reload();
      this.#snackbar.success('Note saved.');
    } catch (error: unknown) {
      console.error('[admin/customers] note save failed', error);
      this.#snackbar.error("We couldn't save the note. Check your connection and try again.");
    } finally {
      this.isSaving.set(false);
    }
  }
}
