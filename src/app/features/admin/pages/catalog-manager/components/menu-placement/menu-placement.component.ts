import { Component, computed, effect, inject, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NavService } from '@core/services/navigation/nav.service';
import { menuFillingSubCategories, menuFillsBrands, menuOptions } from '../../utils/menu-placement.utils';

/**
 * The optional "Add to the Menu" section of the Add Category and Add Brand dialogs (ATS-248):
 * a Menu and a Column from `settings/navigation`. The dialog reads `enabled`, `menuId` and
 * `columnIndex` and adds the link after the category or brand is saved.
 */
@Component({
  selector: 'app-menu-placement',
  host: { class: 'block w-full' },
  imports: [MatFormFieldModule, MatSelectModule, MatSlideToggleModule],
  template: `
    <div class="elements-start-col gap-3 w-full">
      <mat-slide-toggle [checked]="enabled()" (change)="enabled.set($event.checked)">
        Add to the Menu
      </mat-slide-toggle>

      @if (autoMenuLabel(); as menuLabel) {
        <p class="font-body-sm text-on-surface-variant" role="status">
          It will appear in the {{ menuLabel }} menu by itself.
        </p>
      } @else if (brandsFillThemselves() && kind() === 'brand' && !enabled()) {
        <p class="font-body-sm text-on-surface-variant" role="status">
          A menu column that fills itself lists brands automatically.
        </p>
      }

      @if (enabled()) {
        @if (menus().length === 0) {
          <p class="font-body-sm text-on-surface-variant" role="status">
            There is no menu with columns yet. Add it in Navigation.
          </p>
        } @else {
          <mat-form-field class="w-full" appearance="outline" subscriptSizing="dynamic">
            <mat-label>Menu</mat-label>
            <mat-select [value]="menuId()" (selectionChange)="pickMenu($event.value)">
              @for (menu of menus(); track menu.id) {
                <mat-option [value]="menu.id">{{ menu.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (selectedMenu(); as menu) {
            @if (menu.columns.length > 0) {
              <mat-form-field class="w-full" appearance="outline" subscriptSizing="dynamic">
                <mat-label>Column</mat-label>
                <mat-select [value]="columnIndex()" (selectionChange)="columnIndex.set($event.value)">
                  @for (column of menu.columns; track column.index) {
                    <mat-option [value]="column.index">{{ column.title }}</mat-option>
                  }
                </mat-select>
                <mat-hint>The link goes at the end of this column.</mat-hint>
              </mat-form-field>
            } @else {
              <p class="font-body-sm text-on-surface-variant" role="status">
                Every column in this menu fills itself, so there is nothing to add to.
              </p>
            }
            @if (!shown()) {
              <p class="font-body-sm text-on-surface-variant" role="status">
                It is hidden from the store, so the link stays out of the menu until you show it.
              </p>
            }
            @if (menu.hasAutoColumn && menu.columns.length > 0) {
              <p class="font-body-sm text-on-surface-variant">
                Columns that fill themselves aren't listed. New {{ kind() === 'brand' ? 'brands' : 'items' }}
                appear there by themselves.
              </p>
            }
          }
        }
      }
    </div>
  `,
})
export class MenuPlacementComponent {
  readonly #nav = inject(NavService);

  /** What is being added. */
  readonly kind = input.required<'category' | 'brand'>();
  /** The parent category's id for a new sub-category, else null. */
  readonly parentId = input<string | null>(null);
  /** False while the new item is hidden from the store. */
  readonly shown = input(true);

  readonly enabled = model(false);
  readonly menuId = model<string | null>(null);
  readonly columnIndex = model<number | null>(null);

  readonly menus = computed(() => menuOptions(this.#nav.categories()));
  readonly selectedMenu = computed(() => this.menus().find((menu) => menu.id === this.menuId()) ?? null);

  /** The menu that lists this sub-category by itself, when its parent has such a column. */
  readonly autoMenuLabel = computed(() => {
    const parent = this.parentId();
    if (this.kind() !== 'category' || !parent) return null;
    return menuFillingSubCategories(this.#nav.categories(), parent)?.label ?? null;
  });

  readonly brandsFillThemselves = computed(() => menuFillsBrands(this.#nav.categories()));

  constructor() {
    // The menu already lists it by itself: the section starts off.
    effect(() => {
      if (this.autoMenuLabel()) this.enabled.set(false);
    });
    // Turning the section on picks the first menu and column, so the common case is one click.
    effect(() => {
      if (!this.enabled() || this.menuId() !== null) return;
      const first = this.menus().find((menu) => menu.columns.length > 0) ?? this.menus()[0];
      if (first) this.pickMenu(first.id);
    });
  }

  pickMenu(id: string): void {
    this.menuId.set(id);
    this.columnIndex.set(this.menus().find((menu) => menu.id === id)?.columns[0]?.index ?? null);
  }
}
