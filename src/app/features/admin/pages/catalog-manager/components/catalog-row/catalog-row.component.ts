import { Component, input, output } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';

/**
 * One category or brand row on Categories & Brands: drag handle (place it inside a `cdkDrag`),
 * name, address and details, then Hide / Show, Edit and Delete.
 */
@Component({
  selector: 'app-catalog-row',
  host: { class: 'block w-full' },
  imports: [DragDropModule, MatButtonModule, MatProgressSpinnerModule, MatTooltipModule, SharedIconModule],
  template: `
    <div class="catalog-row" [class.catalog-row--hidden]="!published()">
      <span cdkDragHandle class="drag-handle-wrapper p-1" matTooltip="Drag to reorder">
        <mat-icon name="drag_indicator" size="lg" />
      </span>
      <div class="catalog-row__info">
        <span class="font-body-md font-bold!">{{ name() }}</span>
        <span class="catalog-row__meta">{{ address() }} · {{ details() }}</span>
        <span class="font-label-md">{{ published() ? 'Shown' : 'Hidden' }}</span>
      </div>
      <div class="elements-end gap-1 shrink-0">
        <button
          matButton="outlined"
          type="button"
          [disabled]="locked()"
          [attr.aria-label]="busy() ? 'Saving ' + name() : null"
          (click)="toggleShown.emit()"
        >
          @if (busy()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" />
          } @else {
            <span>{{ published() ? 'Hide' : 'Show' }}</span>
          }
        </button>
        <button matIconButton type="button" [attr.aria-label]="'Edit ' + name()" (click)="edit.emit()">
          <mat-icon name="edit" />
        </button>
        <button
          matIconButton
          type="button"
          [disabled]="locked()"
          [attr.aria-label]="'Delete ' + name()"
          (click)="remove.emit()"
        >
          <mat-icon name="delete" />
        </button>
      </div>
    </div>
  `,
})
export class CatalogRowComponent {
  readonly name = input.required<string>();
  /** `/category/caps`, `/brand/nox`. */
  readonly address = input.required<string>();
  /** "3 live products · in Apparel". */
  readonly details = input.required<string>();
  readonly published = input.required<boolean>();
  /** This row's action is running. */
  readonly busy = input(false);
  /** Some row's action is running: Hide / Show and Delete wait. */
  readonly locked = input(false);

  readonly toggleShown = output();
  readonly edit = output();
  readonly remove = output();
}
