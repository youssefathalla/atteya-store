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
  effectiveNavTarget,
  navTargetName,
  outsideLinkProblem,
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
  | { readonly kind: 'outside' }
  | { readonly kind: 'target'; readonly target: NavTarget; readonly label: string };

interface ChoiceGroup {
  readonly label: string;
  readonly choices: readonly Choice[];
}

const MENU_LABEL = 'Only Opens the Menu';
const SHOP_LABEL = 'Shop with Filters…';
const OUTSIDE_LABEL = 'Outside Link';

function choiceLabel(choice: Choice): string {
  switch (choice.kind) {
    case 'menu':
      return MENU_LABEL;
    case 'shop-dialog':
      return SHOP_LABEL;
    case 'outside':
      return OUTSIDE_LABEL;
    case 'target':
      return choice.label;
  }
}

/**
 * **Links To** (ATS-246, ATS-267): the one picker for every link staff set up in Navigation and
 * Home Page. A searchable list of categories, brands, pages and running offers, plus Shop with
 * Filters… and Outside Link (a full `https://` address on another site, the only typed choice).
 * A link saved as a typed address opens as the target that address names (`effectiveNavTarget`);
 * one that can't be matched shows "Pick where this goes".
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
  /** Offer Outside Link (off where the store can only open its own pages). */
  readonly allowOutside = input<boolean>(true);
  /** Unique id prefix for the inputs. */
  readonly fieldId = input.required<string>();

  readonly targetChange = output<NavTargetChange>();

  readonly #catalogLists = this.#catalog.catalog;

  /** What the saved link points at, with an old typed address turned into its target. */
  readonly effective = computed<NavTarget | null>(() =>
    effectiveNavTarget(this.target(), this.path(), this.#catalog.bestCatalog()),
  );

  /** Outside Link was picked (its address box shows even while it is empty). */
  readonly #outsidePicked = linkedSignal<boolean>(() => this.effective()?.kind === 'url');

  readonly mode = computed<'menu' | 'outside' | 'target' | 'pick' | 'none'>(() => {
    if (this.#outsidePicked()) return 'outside';
    if (this.effective()) return 'target';
    if (this.path()?.trim() || this.target()) return 'pick';
    return this.allowMenuOnly() ? 'menu' : 'none';
  });

  /** The text the Links To box shows for the current choice. */
  readonly currentLabel = computed(() => {
    switch (this.mode()) {
      case 'menu':
        return MENU_LABEL;
      case 'outside':
        return OUTSIDE_LABEL;
      case 'target':
        return this.#targetLabel(this.effective()!);
      default:
        return '';
    }
  });

  readonly query = linkedSignal<string>(() => this.currentLabel());

  readonly resolved = computed(() => {
    const target = this.effective();
    if (!target || target.kind === 'url') return null;
    const catalog = this.#catalog.targetCatalog();
    // Hidden and missing are only known from the full lists; pages need no list at all.
    if (!catalog) return { path: resolveNavTarget(target, this.#catalog.bestCatalog()).path, problem: null };
    return resolveNavTarget(target, catalog);
  });

  /** The address the store will open, shown under the field. */
  readonly address = computed(() => {
    const mode = this.mode();
    if (mode === 'menu') return 'Clicking the name only opens its menu.';
    if (mode !== 'target') return '';
    const path = this.resolved()?.path ?? this.path();
    return path ? `Opens ${path}` : '';
  });

  /** Red note when the target is hidden, gone or ended, or the old address can't be matched. */
  readonly problem = computed(() => {
    if (this.mode() === 'pick') return 'Pick where this goes.';
    const target = this.effective();
    const resolved = this.resolved();
    if (!target || !resolved?.problem) return null;
    if (resolved.problem === 'hidden') return 'Hidden on the store, so shoppers won’t see this link.';
    if (resolved.problem === 'ended') return 'This offer isn’t running now. Pick another.';
    if (target.kind === 'brand' || target.kind === 'shop') return 'This brand no longer exists.';
    return 'This category no longer exists.';
  });

  /** The Outside Link's address, and why it can't be saved yet. */
  readonly outsideUrl = computed(() => {
    const target = this.target();
    return target?.kind === 'url' ? target.url : '';
  });
  readonly outsideProblem = computed(() =>
    this.mode() === 'outside' && this.outsideUrl().trim() ? outsideLinkProblem(this.outsideUrl()) : null,
  );

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
    const offers: Choice[] = this.#catalog
      .runningOffers()
      .filter((offer) => matches(offer.name))
      .map((offer) => ({ kind: 'target', target: { kind: 'offer', id: offer.id }, label: offer.name }));

    const more: Choice[] = [{ kind: 'shop-dialog' }];
    if (this.allowOutside()) more.push({ kind: 'outside' });

    const groups: ChoiceGroup[] = [];
    if (this.allowMenuOnly()) groups.push({ label: '', choices: [{ kind: 'menu' }] });
    if (categories.length) groups.push({ label: 'Categories', choices: categories });
    if (brands.length) groups.push({ label: 'Brands', choices: brands });
    if (pages.length) groups.push({ label: 'Pages', choices: pages });
    if (offers.length) groups.push({ label: 'Offers', choices: offers });
    groups.push({ label: 'More', choices: more });
    return groups;
  });

  readonly choiceLabel = choiceLabel;
  readonly displayWith = (value: Choice | string | null): string =>
    typeof value === 'string' ? value : value ? choiceLabel(value) : '';

  readonly isShop = computed(() => this.effective()?.kind === 'shop');

  async onPicked(event: MatAutocompleteSelectedEvent): Promise<void> {
    const choice = event.option.value as Choice;
    switch (choice.kind) {
      case 'menu':
        this.#outsidePicked.set(false);
        this.targetChange.emit({ target: null, path: '', name: null });
        break;
      case 'outside':
        this.#outsidePicked.set(true);
        this.query.set(OUTSIDE_LABEL);
        if (this.target()?.kind !== 'url') {
          this.targetChange.emit({ target: { kind: 'url', url: '' }, path: '', name: null });
        }
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
    const current = this.effective();
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

  onOutsideInput(value: string): void {
    // Kept as typed while typing; save checks it (a full https:// address on another site).
    const url = value.trim();
    this.targetChange.emit({ target: { kind: 'url', url }, path: url, name: null });
  }

  /** Put the box back on the current choice when the list closes without a pick. */
  onClosed(): void {
    const label = this.currentLabel();
    this.query.set(label);
    // The list writes the picked choice's name into the box; an unchanged query wouldn't undo it.
    this.linksToInput().nativeElement.value = label;
  }

  #emitTarget(target: NavTarget): void {
    this.#outsidePicked.set(false);
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
      case 'offer':
        return `Offer: ${this.#catalog.runningOffers().find((offer) => offer.id === target.id)?.name ?? target.id}`;
      case 'url':
        return OUTSIDE_LABEL;
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
