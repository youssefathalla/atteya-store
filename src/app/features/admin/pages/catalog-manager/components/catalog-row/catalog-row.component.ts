import { Component, input, output } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule, type MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { insideLabel, liveCountLabel } from '../../utils/catalog-manager.utils';

/**
 * One compact category or brand row on Categories & Brands (ATS-264): drag handle (place it
 * inside a `cdkDrag`), the open arrow when something is inside, the name with "6 inside", the
 * live count, the Shown / Hidden switch and a ⋮ menu (Edit, Add Inside, Move Up, Move Down, Open on
 * the Store, Delete; ATS-265).
 * On phone the live count sits under the name.
 */
@Component({
  selector: 'app-catalog-row',
  host: { class: 'block w-full' },
  imports: [
    DragDropModule,
    MatButtonModule,
    MatDividerModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    SharedIconModule,
  ],
  template: `
    <div
      class="catalog-row"
      [class.catalog-row--hidden]="!published()"
      [class.catalog-row--inside]="inside()"
    >
      <span
        cdkDragHandle
        class="drag-handle-wrapper catalog-row__handle"
        matTooltip="Drag to change the order"
      >
        <mat-icon name="drag_indicator" size="lg" />
      </span>

      @if (insideCount() > 0) {
        <button
          type="button"
          class="catalog-row__arrow"
          [attr.aria-expanded]="open()"
          [attr.aria-label]="(open() ? 'Close ' : 'Open ') + name()"
          (click)="toggleOpen.emit()"
        >
          <span class="catalog-row__chevron" [class.catalog-row__chevron--open]="open()">
            <mat-icon name="chevron_right" />
          </span>
        </button>
      } @else if (!inside()) {
        <span class="catalog-row__spacer" aria-hidden="true"></span>
      }

      <div class="catalog-row__info">
        <span class="catalog-row__title">
          @if (insideCount() > 0) {
            <button
              type="button"
              class="catalog-row__name"
              [attr.aria-expanded]="open()"
              (click)="toggleOpen.emit()"
            >
              {{ name() }}
            </button>
          } @else {
            <span class="catalog-row__name">{{ name() }}</span>
          }
          <span class="catalog-row__meta catalog-row__wide">{{ insideText() }}</span>
        </span>
        <span class="catalog-row__meta catalog-row__narrow">
          {{ liveText() }}{{ insideCount() > 0 ? ' · ' + insideText() : '' }}
        </span>
      </div>

      <span class="catalog-row__meta catalog-row__count catalog-row__wide">{{ liveText() }}</span>

      <span class="catalog-row__switch">
        <mat-slide-toggle
          [checked]="published()"
          [disabled]="busy()"
          [aria-label]="'Show ' + name() + ' on the store'"
          (change)="onSwitch($event)"
        />
        <span class="catalog-row__meta catalog-row__state">{{ published() ? 'Shown' : 'Hidden' }}</span>
      </span>

      <button matIconButton type="button" [attr.aria-label]="'More for ' + name()" [matMenuTriggerFor]="more">
        <mat-icon name="more_vert" />
      </button>
      <mat-menu #more="matMenu" xPosition="before">
        <button mat-menu-item type="button" (click)="edit.emit()">
          <mat-icon name="edit" />
          <span>Edit</span>
        </button>
        @if (canAddInside()) {
          <button mat-menu-item type="button" (click)="addInside.emit()">
            <mat-icon name="add" />
            <span>Add Inside</span>
          </button>
        }
        @if (canMoveUp()) {
          <button mat-menu-item type="button" [disabled]="busy()" (click)="moveUp.emit()">
            <mat-icon name="arrow_upward" />
            <span>Move Up</span>
          </button>
        }
        @if (canMoveDown()) {
          <button mat-menu-item type="button" [disabled]="busy()" (click)="moveDown.emit()">
            <mat-icon name="arrow_downward" />
            <span>Move Down</span>
          </button>
        }
        <a mat-menu-item [href]="storeUrl()" target="_blank" rel="noopener">
          <mat-icon name="open_in_new" />
          <span>Open on the Store</span>
        </a>
        <mat-divider />
        <button mat-menu-item type="button" [disabled]="busy()" (click)="remove.emit()">
          <mat-icon name="delete" />
          <span>Delete</span>
        </button>
      </mat-menu>
    </div>
  `,
})
export class CatalogRowComponent {
  readonly name = input.required<string>();
  /** Products shoppers can buy in it. */
  readonly liveCount = input.required<number>();
  /** Categories inside it (top-level categories only); 0 for brands. */
  readonly insideCount = input(0);
  /** The categories inside are showing. */
  readonly open = input(false);
  /** A row inside an open category: indented, no arrow column. */
  readonly inside = input(false);
  /** Top-level categories offer Add Inside. */
  readonly canAddInside = input(false);
  /** `/category/apparel`, `/brand/nox`. */
  readonly storeUrl = input.required<string>();
  readonly published = input.required<boolean>();
  /** This row's switch or Delete check is running: both wait. */
  readonly busy = input(false);
  /** Move Up / Move Down within its own level (ATS-265): not on the first / last row. */
  readonly canMoveUp = input(false);
  readonly canMoveDown = input(false);

  readonly toggleShown = output();
  readonly toggleOpen = output();
  readonly edit = output();
  readonly addInside = output();
  readonly remove = output();
  readonly moveUp = output();
  readonly moveDown = output();

  liveText(): string {
    return liveCountLabel(this.liveCount());
  }

  insideText(): string {
    return insideLabel(this.insideCount());
  }

  /** The list decides (it may ask first), so the switch goes back until `published` changes. */
  onSwitch(event: MatSlideToggleChange): void {
    event.source.checked = this.published();
    this.toggleShown.emit();
  }
}
