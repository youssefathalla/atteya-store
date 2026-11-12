import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NavService } from '@core/services/navigation/nav.service';
import {
  menuDisplayName,
  menuFillingSubCategories,
  menuFillsBrands,
  menuForBrands,
  menuForCategory,
  menuOptions,
  type MenuOption,
} from '../../utils/menu-placement.utils';

let nextId = 0;

/**
 * The "Show in the … menu" part of the Add Category and Add Brand windows (ATS-248, ATS-264).
 * When a top menu opens the chosen "Inside" category (or the Brands page, for a brand), the
 * switch names that menu, starts on and only asks for the Column. Otherwise it starts off and
 * asks for a Menu and a Column. The dialog reads `enabled`, `menuId` and `columnIndex` and adds
 * the link after the category or brand is saved.
 */
@Component({
  selector: 'app-menu-placement',
  host: { class: 'block w-full' },
  imports: [MatFormFieldModule, MatSelectModule, MatSlideToggleModule],
  template: `
    <div class="catalog-dialog-box">
      @if (autoMenuLabel(); as menuLabel) {
        <p class="font-body-md" role="status">It will appear in the {{ menuLabel }} menu by itself.</p>
      } @else {
        <div class="catalog-switch-row">
          <span class="elements-start-col gap-0.5 min-w-0">
            <span [id]="labelId" class="font-body-md font-bold!">{{ switchLabel() }}</span>
            <span class="font-body-sm text-on-surface-variant">
              @if (brandsFillThemselves() && kind() === 'brand' && !enabled()) {
                A menu column that fills itself lists brands by itself.
              } @else if (!shown()) {
                It's hidden from the store, so the link stays out of the menu until you show it.
              } @else {
                The link appears once a product is live in it.
              }
            </span>
          </span>
          <mat-slide-toggle
            [aria-labelledby]="labelId"
            [checked]="enabled()"
            (change)="setEnabled($event.checked)"
          />
        </div>

        @if (enabled()) {
          @if (menus().length === 0) {
            <p class="font-body-sm text-on-surface-variant" role="status">
              There is no menu with columns yet. Add one in Navigation.
            </p>
          } @else {
            @if (!homeMenu()) {
              <mat-form-field class="w-full" appearance="outline" subscriptSizing="dynamic">
                <mat-label>Menu</mat-label>
                <mat-select [value]="menuId()" (selectionChange)="pickMenu($event.value)">
                  @for (menu of menus(); track menu.id) {
                    <mat-option [value]="menu.id">{{ displayName(menu.label) }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }

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
              @if (menu.hasAutoColumn && menu.columns.length > 0) {
                <p class="font-body-sm text-on-surface-variant">
                  Columns that fill themselves aren't listed. New
                  {{ kind() === 'brand' ? 'brands' : 'categories' }} appear there by themselves.
                </p>
              }
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
  /** The "Inside" category of a new category, else null. */
  readonly parent = input<{ readonly id: string; readonly path: string } | null>(null);
  /** False while the new item is hidden from the store. */
  readonly shown = input(true);

  readonly enabled = model(false);
  readonly menuId = model<string | null>(null);
  readonly columnIndex = model<number | null>(null);

  readonly labelId = `menu-placement-${nextId++}`;
  readonly displayName = menuDisplayName;

  /** The person flipped the switch, so the default no longer follows "Inside". */
  readonly #touched = signal(false);

  readonly menus = computed(() => menuOptions(this.#nav.categories()));
  readonly selectedMenu = computed(() => this.menus().find((menu) => menu.id === this.menuId()) ?? null);

  /** The menu that opens the chosen "Inside" category (or the Brands page), when it has columns. */
  readonly homeMenu = computed((): MenuOption | null => {
    const categories = this.#nav.categories();
    const parent = this.parent();
    const home =
      this.kind() === 'brand'
        ? menuForBrands(categories)
        : parent
          ? menuForCategory(categories, parent)
          : null;
    const option = home ? this.menus().find((menu) => menu.id === home.id) : undefined;
    return option && option.columns.length > 0 ? option : null;
  });

  readonly switchLabel = computed(() => {
    const home = this.homeMenu();
    return home ? `Show in the ${menuDisplayName(home.label)} menu` : 'Show in a menu';
  });

  /** The menu that lists this new category by itself, when its "Inside" category has such a column. */
  readonly autoMenuLabel = computed(() => {
    const parent = this.parent();
    if (this.kind() !== 'category' || !parent) return null;
    const label = menuFillingSubCategories(this.#nav.categories(), parent.id)?.label;
    return label ? menuDisplayName(label) : null;
  });

  readonly brandsFillThemselves = computed(() => menuFillsBrands(this.#nav.categories()));

  constructor() {
    // On by default when a menu opens the chosen "Inside"; off when the menu fills itself.
    effect(() => {
      const auto = this.autoMenuLabel();
      const home = this.homeMenu();
      untracked(() => {
        if (auto) this.enabled.set(false);
        else if (!this.#touched()) this.enabled.set(home !== null);
      });
    });
    // The named menu is the one the link goes in; otherwise the first menu, so one click is enough.
    effect(() => {
      const home = this.homeMenu();
      const enabled = this.enabled();
      untracked(() => {
        if (home) {
          if (this.menuId() !== home.id) this.pickMenu(home.id);
          return;
        }
        if (!enabled || this.selectedMenu()) return;
        const first = this.menus().find((menu) => menu.columns.length > 0) ?? this.menus()[0];
        if (first) this.pickMenu(first.id);
      });
    });
  }

  setEnabled(enabled: boolean): void {
    this.#touched.set(true);
    this.enabled.set(enabled);
  }

  pickMenu(id: string): void {
    this.menuId.set(id);
    this.columnIndex.set(this.menus().find((menu) => menu.id === id)?.columns[0]?.index ?? null);
  }
}
