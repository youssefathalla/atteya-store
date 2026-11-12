import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import {
  NAV_SHOP_CATEGORY_LABELS,
  NAV_TARGET_PAGE_LABELS,
  NAV_TARGET_PAGES,
  navTargetName,
  resolveNavTarget,
  type NavShopFilters,
  type NavTarget,
} from '@core/services/navigation';
import { PlayerListService } from '@core/services/products/player-list.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  ShopFiltersDialogComponent,
  type ShopFiltersDialogData,
} from '../../dialogs/shop-filters-dialog/shop-filters-dialog.component';
import { NavigationCatalogService } from '../../services/navigation-catalog.service';

/** What the field now points at; `target: null` with an empty path = only opens the menu. */
export interface NavTargetChange {
  readonly target: NavTarget | null;
  readonly path: string;
  /** The target's plain name, to fill an empty label. */
  readonly name: string | null;
}

type Choice =
  | { readonly kind: 'menu' }
  | { readonly kind: 'shop-dialog' }
  | { readonly kind: 'advanced' }
  | { readonly kind: 'target'; readonly target: NavTarget; readonly label: string };

interface ChoiceGroup {
  readonly label: string;
  readonly choices: readonly Choice[];
}

const MENU_LABEL = 'Only Opens the Menu';
const SHOP_LABEL = 'Shop with Filters…';
const ADVANCED_LABEL = 'Advanced: Type an Address';

function choiceLabel(choice: Choice): string {
  switch (choice.kind) {
    case 'menu':
      return MENU_LABEL;
    case 'shop-dialog':
      return SHOP_LABEL;
    case 'advanced':
      return ADVANCED_LABEL;
    case 'target':
      return choice.label;
  }
}

/**
 * **Links To** (ATS-246): one searchable list of categories, brands and pages, plus Shop with
 * Filters… and Advanced: Type an Address (the old address box with ✨). Used by the menu
 * details, every link row and the add dialogs.
 */
@Component({
  selector: 'app-nav-target-field',
  templateUrl: './nav-target-field.component.html',
  host: { class: 'block w-full' },
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class NavTargetFieldComponent {
  readonly #catalog = inject(NavigationCatalogService);
  readonly #players = inject(PlayerListService);
  readonly #dialog = inject(MatDialog);
  private readonly linksToInput = viewChild.required<ElementRef<HTMLInputElement>>('linksTo');

  readonly target = input<NavTarget | undefined>(undefined);
  readonly path = input<string | undefined>(undefined);
  /** Top-level menus may link nowhere and only open their menu. */
  readonly allowMenuOnly = input<boolean>(false);
  /** Unique id prefix for the inputs. */
  readonly fieldId = input.required<string>();

  readonly targetChange = output<NavTargetChange>();
  /** ✨: fill the address from the label. */
  readonly suggest = output<void>();

  /** Old links (address only) and typed addresses show the address box. */
  readonly #advancedPicked = linkedSignal<boolean>(() => {
    const target = this.target();
    return target?.kind === 'url' || (!target && !!this.path());
  });

  readonly mode = computed<'menu' | 'advanced' | 'target' | 'none'>(() => {
    if (this.#advancedPicked()) return 'advanced';
    const target = this.target();
    if (target && target.kind !== 'url') return 'target';
    return this.allowMenuOnly() ? 'menu' : 'none';
  });

  readonly #catalogLists = this.#catalog.catalog;

  /** The text the Links To box shows for the current choice. */
  readonly currentLabel = computed(() => {
    const mode = this.mode();
    if (mode === 'menu') return MENU_LABEL;
    if (mode === 'advanced') return ADVANCED_LABEL;
    if (mode === 'none') return '';
    return this.#targetLabel(this.target()!);
  });

  readonly query = linkedSignal<string>(() => this.currentLabel());

  readonly resolved = computed(() => {
    const target = this.target();
    const catalog = this.#catalog.targetCatalog();
    if (!target || target.kind === 'url') return null;
    // Hidden and missing are only known from the full lists; pages need no list at all.
    if (!catalog) return { path: resolveNavTarget(target, this.#catalog.bestCatalog()).path, problem: null };
    return resolveNavTarget(target, catalog);
  });

  /** The address the store will open, shown under the field. */
  readonly address = computed(() => {
    const mode = this.mode();
    if (mode === 'menu') return 'Clicking the name only opens its menu.';
    if (mode === 'none') return '';
    const path = this.resolved()?.path ?? this.path();
    return path ? `Opens ${path}` : '';
  });

  /** Red note when the target is hidden or gone. */
  readonly problem = computed(() => {
    const target = this.target();
    const resolved = this.resolved();
    if (!target || !resolved?.problem) return null;
    if (resolved.problem === 'hidden') return 'Hidden on the store, so shoppers won’t see this link.';
    if (target.kind === 'brand' || target.kind === 'shop') return 'This brand no longer exists.';
    return 'This category no longer exists.';
  });

  readonly groups = computed<readonly ChoiceGroup[]>(() => {
    const lists = this.#catalogLists();
    const raw = this.query().trim().toLowerCase();
    const search = raw === this.currentLabel().toLowerCase() ? '' : raw;
    const matches = (label: string): boolean => !search || label.toLowerCase().includes(search);

    const categories: Choice[] = (lists?.categories ?? [])
      .filter((entry) => matches(entry.displayName))
      .map((entry) => ({
        kind: 'target',
        target: { kind: 'category', id: entry.id },
        label: entry.displayName,
      }));
    const brands: Choice[] = (lists?.brands ?? [])
      .filter((entry) => matches(entry.name))
      .map((entry) => ({ kind: 'target', target: { kind: 'brand', id: entry.id }, label: entry.name }));
    const pages: Choice[] = NAV_TARGET_PAGES.filter((page) => matches(NAV_TARGET_PAGE_LABELS[page])).map(
      (page) => ({ kind: 'target', target: { kind: 'page', page }, label: NAV_TARGET_PAGE_LABELS[page] }),
    );

    const groups: ChoiceGroup[] = [];
    if (this.allowMenuOnly()) groups.push({ label: '', choices: [{ kind: 'menu' }] });
    if (categories.length) groups.push({ label: 'Categories', choices: categories });
    if (brands.length) groups.push({ label: 'Brands', choices: brands });
    if (pages.length) groups.push({ label: 'Pages', choices: pages });
    groups.push({ label: 'More', choices: [{ kind: 'shop-dialog' }, { kind: 'advanced' }] });
    return groups;
  });

  readonly choiceLabel = choiceLabel;
  readonly displayWith = (value: Choice | string | null): string =>
    typeof value === 'string' ? value : value ? choiceLabel(value) : '';

  readonly isShop = computed(() => this.target()?.kind === 'shop');

  async onPicked(event: MatAutocompleteSelectedEvent): Promise<void> {
    const choice = event.option.value as Choice;
    switch (choice.kind) {
      case 'menu':
        this.#advancedPicked.set(false);
        this.targetChange.emit({ target: null, path: '', name: null });
        break;
      case 'advanced':
        this.#advancedPicked.set(true);
        this.query.set(ADVANCED_LABEL);
        break;
      case 'shop-dialog':
        await this.editShopFilters();
        break;
      case 'target':
        this.#emitTarget(choice.target);
        break;
    }
  }

  async editShopFilters(): Promise<void> {
    const current = this.target();
    const filters: NavShopFilters = current?.kind === 'shop' ? current.filters : {};
    const ref = this.#dialog.open<ShopFiltersDialogComponent, ShopFiltersDialogData, NavShopFilters | null>(
      ShopFiltersDialogComponent,
      {
        data: { filters, brands: this.#catalogLists()?.brands ?? [] },
        width: '520px',
        maxWidth: '92vw',
      },
    );
    const picked = await firstValueFrom(ref.afterClosed());
    if (picked) this.#emitTarget({ kind: 'shop', filters: picked });
  }

  onAddressInput(value: string): void {
    // Kept as typed while typing ("/category/" must not lose its slash); tidied on save.
    // An emptied box stays a typed address (save then asks for one) so the box doesn't vanish.
    const path = value.trim();
    this.targetChange.emit({ target: { kind: 'url', url: path }, path, name: null });
  }

  /** Put the box back on the current choice when the list closes without a pick. */
  onClosed(): void {
    const label = this.currentLabel();
    this.query.set(label);
    // The list writes the picked choice's name into the box; an unchanged query wouldn't undo it.
    this.linksToInput().nativeElement.value = label;
  }

  #emitTarget(target: NavTarget): void {
    this.#advancedPicked.set(false);
    const catalog = this.#catalog.bestCatalog();
    const path = resolveNavTarget(target, catalog).path ?? '';
    this.targetChange.emit({ target, path, name: navTargetName(target, catalog) });
  }

  #targetLabel(target: NavTarget): string {
    const lists = this.#catalogLists();
    switch (target.kind) {
      case 'category':
        return lists?.categories.find((entry) => entry.id === target.id)?.displayName ?? target.id;
      case 'brand':
        return lists?.brands.find((entry) => entry.id === target.id)?.name ?? target.id;
      case 'page':
        return NAV_TARGET_PAGE_LABELS[target.page];
      case 'shop':
        return this.#shopLabel(target.filters);
      case 'url':
        return ADVANCED_LABEL;
    }
  }

  #shopLabel(filters: NavShopFilters): string {
    const parts: string[] = [];
    if (filters.brand) {
      parts.push(
        this.#catalogLists()?.brands.find((entry) => entry.id === filters.brand)?.name ?? filters.brand,
      );
    }
    if (filters.player) parts.push(this.#players.nameOf(filters.player) ?? filters.player);
    if (filters.category) parts.push(NAV_SHOP_CATEGORY_LABELS[filters.category]);
    if (filters.gender) parts.push(filters.gender === 'women' ? 'Women' : 'Men');
    if (filters.onSale) parts.push('On Sale');
    if (filters.newArrivals) parts.push('New Arrivals');
    return parts.length ? `Shop: ${parts.join(' · ')}` : 'Shop: All';
  }
}
