import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-row-scroll-nav',
  host: { class: 'row-scroll-nav' },
  imports: [MatButtonModule, SharedIconModule],
  template: `
    <button
      matIconButton
      type="button"
      aria-label="Previous"
      [disabled]="!canPrev()"
      (click)="prev.emit()"
    >
      <mat-icon name="arrow_back" />
    </button>
    <button
      matIconButton
      type="button"
      aria-label="Next"
      [disabled]="!canNext()"
      (click)="next.emit()"
    >
      <mat-icon name="arrow_forward" />
    </button>
    @if (showProgress()) {
    <div
      class="row-scroll-nav__progress"
      role="progressbar"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="100"
      [attr.aria-valuenow]="Math.round(progress() * 100)"
      [style.--row-scroll-progress]="progress()"
    >
      <div class="row-scroll-nav__progress-fill" aria-hidden="true"></div>
    </div>
    }
  `,
})
export class RowScrollNavComponent {
  readonly progress = input(0);
  /** Show the thin progress line next to the arrows (off when the page draws its own). */
  readonly showProgress = input(true);
  readonly canPrev = input(false);
  readonly canNext = input(false);
  readonly prev = output<void>();
  readonly next = output<void>();

  protected readonly Math = Math;
}
