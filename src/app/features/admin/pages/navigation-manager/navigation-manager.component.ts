import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { NavService } from '@layout/navbar/nav.service';
import { NavCategory, MegaMenuColumn, MegaMenuLink } from '@layout/navbar/nav.model';
import { NAV_CATEGORIES } from '@layout/navbar/nav.data';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-navigation-manager',
  templateUrl: './navigation-manager.component.html',
  imports: [
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class NavigationManagerComponent {
  readonly #navService = inject(NavService);
  readonly #snackbar = inject(SnackbarService);
  readonly #dialog = inject(MatDialog);

  readonly isLive = this.#navService.isLive;
  readonly isLoading = this.#navService.isLoading;

  // Staged draft state for safe editing before publishing to Firestore
  readonly draftCategories = signal<NavCategory[]>([]);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly isDraftDirty = signal<boolean>(false);

  readonly isSaving = signal<boolean>(false);
  readonly isSeeding = signal<boolean>(false);

  // Selected Category
  readonly selectedCategory = computed(() => {
    const id = this.selectedCategoryId();
    if (!id) return this.draftCategories()[0] ?? null;
    return this.draftCategories().find((c) => c.id === id) ?? null;
  });

  constructor() {
    // Synchronize initial draft state with NavService once Firestore finishes fetching
    effect(() => {
      // 1. Wait until Firestore finishes initial load
      if (this.#navService.isLoading()) return;

      const liveCategories = this.#navService.categories();
      // 2. If user hasn't made uncommitted edits, keep draft in sync with live data
      if (!this.isDraftDirty() && liveCategories.length > 0) {
        this.resetDraftFromSource(liveCategories);
      }
    });
  }

  resetDraftFromSource(source: readonly NavCategory[]): void {
    // Deep copy to prevent mutating the frozen readonly state
    const cloned = structuredClone(source) as NavCategory[];
    this.draftCategories.set(cloned);
    const currentSelected = this.selectedCategoryId();
    if (cloned.length > 0) {
      if (!currentSelected || !cloned.some((c) => c.id === currentSelected)) {
        this.selectedCategoryId.set(cloned[0].id);
      }
    }
  }

  // --- Category Actions ---
  selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
  }

  addCategory(): void {
    this.isDraftDirty.set(true);
    const newId = `category-${Date.now()}`;
    const newCat: NavCategory = {
      id: newId,
      label: '',
      path: `/category/${newId}`,
      megaMenu: [],
    };

    this.draftCategories.update((list) => [...list, newCat]);
    this.selectedCategoryId.set(newId);
    this.#snackbar.info('New category added to draft.');
  }

  deleteCategory(id: string): void {
    this.isDraftDirty.set(true);
    this.draftCategories.update((list) => list.filter((c) => c.id !== id));
    if (this.selectedCategoryId() === id) {
      const remaining = this.draftCategories();
      this.selectedCategoryId.set(remaining.length > 0 ? remaining[0].id : null);
    }
    this.#snackbar.info('Category removed from draft.');
  }

  moveCategory(index: number, direction: 'up' | 'down'): void {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const list = [...this.draftCategories()];
    if (targetIndex < 0 || targetIndex >= list.length) return;

    this.isDraftDirty.set(true);
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);
    this.draftCategories.set(list);
  }

  dropCategory(event: CdkDragDrop<NavCategory[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.isDraftDirty.set(true);
    const list = [...this.draftCategories()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.draftCategories.set(list);
  }

  updateCategoryBasic(field: 'label' | 'path', value: unknown): void {
    const current = this.selectedCategory();
    if (!current) return;

    this.isDraftDirty.set(true);
    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, [field]: value } : c)),
    );
  }

  slugify(text: string): string {
    let slug = text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-');
    while (slug.startsWith('-')) slug = slug.slice(1);
    while (slug.endsWith('-')) slug = slug.slice(0, -1);
    return slug;
  }

  updateCategoryPath(rawPath: string): void {
    const current = this.selectedCategory();
    if (!current) return;

    this.isDraftDirty.set(true);
    let path = rawPath.trim();
    if (path && !path.startsWith('/')) {
      path = `/${path}`;
    }

    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, path } : c)),
    );
  }

  generateCategoryPath(): void {
    const current = this.selectedCategory();
    if (!current?.label) return;

    const slug = this.slugify(current.label);
    const newPath = slug ? `/category/${slug}` : '/category';
    this.updateCategoryPath(newPath);
    this.#snackbar.info(`Path generated: "${newPath}"`);
  }

  // --- Mega Menu Column Actions ---
  addColumn(): void {
    const current = this.selectedCategory();
    if (!current) return;

    this.isDraftDirty.set(true);
    const newCol: MegaMenuColumn = {
      title: '',
      links: [],
    };

    const updatedMenu = [...(current.megaMenu ?? []), newCol];
    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  deleteColumn(colIndex: number): void {
    this.isDraftDirty.set(true);
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    const updatedMenu = current.megaMenu.filter((_, idx) => idx !== colIndex);
    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  updateColumnTitle(colIndex: number, title: string): void {
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    this.isDraftDirty.set(true);
    const updatedMenu = current.megaMenu.map((col, idx) =>
      idx === colIndex ? { ...col, title } : col,
    );
    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  dropColumn(event: CdkDragDrop<MegaMenuColumn[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    this.isDraftDirty.set(true);
    const columns = [...current.megaMenu];
    moveItemInArray(columns, event.previousIndex, event.currentIndex);

    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: columns } : c)),
    );
  }

  // --- Link Actions ---
  addLink(colIndex: number): void {
    this.isDraftDirty.set(true);
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    const newLink: MegaMenuLink = {
      label: '',
      path: '',
    };

    const updatedMenu = current.megaMenu.map((col, idx) => {
      if (idx !== colIndex) return col;
      return { ...col, links: [...col.links, newLink] };
    });

    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  deleteLink(colIndex: number, linkIndex: number): void {
    this.isDraftDirty.set(true);
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    const updatedMenu = current.megaMenu.map((col, idx) => {
      if (idx !== colIndex) return col;
      return { ...col, links: col.links.filter((_, lIdx) => lIdx !== linkIndex) };
    });

    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  dropLink(colIndex: number, event: CdkDragDrop<MegaMenuLink[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    this.isDraftDirty.set(true);
    const updatedMenu = current.megaMenu.map((col, idx) => {
      if (idx !== colIndex) return col;
      const links = [...col.links];
      moveItemInArray(links, event.previousIndex, event.currentIndex);
      return { ...col, links };
    });

    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  generateLinkSlug(colIndex: number, linkIndex: number): void {
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;
    const link = current.megaMenu[colIndex]?.links[linkIndex];
    if (!link) return;

    this.isDraftDirty.set(true);
    const basePath =
      current.path || `/category/${this.slugify(current.label || current.id)}`;
    const slug = this.slugify(link.label || 'item');
    this.updateLinkField(colIndex, linkIndex, 'path', `${basePath}/${slug}`);
  }

  updateLinkField(
    colIndex: number,
    linkIndex: number,
    field: keyof MegaMenuLink,
    value: unknown,
  ): void {
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;

    this.isDraftDirty.set(true);
    const basePath =
      current.path || `/category/${this.slugify(current.label || current.id)}`;

    const updatedMenu = current.megaMenu.map((col, idx) => {
      if (idx !== colIndex) return col;
      const updatedLinks = col.links.map((link, lIdx) => {
        if (lIdx !== linkIndex) return link;
        const updated = { ...link, [field]: value };
        // Auto-sync path when label changes for effortless non-technical management
        if (field === 'label' && typeof value === 'string' && value.trim()) {
          const oldSlug = this.slugify(link.label);
          const currentPath = link.path;
          if (
            !currentPath ||
            currentPath === '/category' ||
            currentPath.endsWith(`/${oldSlug}`) ||
            currentPath.endsWith('/new-link')
          ) {
            updated.path = `${basePath}/${this.slugify(value)}`;
          }
        }
        return updated;
      });
      return { ...col, links: updatedLinks };
    });

    this.draftCategories.update((list) =>
      list.map((c) => (c.id === current.id ? { ...c, megaMenu: updatedMenu } : c)),
    );
  }

  // --- Firestore Actions ---
  async publishToFirestore(): Promise<void> {
    const categories = this.draftCategories();

    // Pre-flight draft validation
    for (const cat of categories) {
      if (!cat.label.trim()) {
        this.#snackbar.error(`Category "${cat.id}" is missing a label.`);
        return;
      }
      if (cat.megaMenu) {
        for (const col of cat.megaMenu) {
          for (const link of col.links) {
            if (!link.label.trim()) {
              this.#snackbar.error(`A link in category "${cat.label}" is missing a label.`);
              return;
            }
            if (!link.path.trim()) {
              this.#snackbar.error(`Link "${link.label}" is missing a target path.`);
              return;
            }
          }
        }
      }
    }

    this.isSaving.set(true);
    try {
      await this.#navService.updateNavigation(categories);
      this.isDraftDirty.set(false);
      this.#snackbar.success('Published! Navigation updated in Firestore.');
    } catch (err) {
      console.error('Failed to publish navigation to Firestore:', err);
      this.#snackbar.error('Failed to save to Firestore. Check permissions.');
    } finally {
      this.isSaving.set(false);
    }
  }

  seedFromDefaults(): void {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Seed Navigation Database',
          message:
            'Are you sure you want to seed the database? This will populate settings/navigation in Firestore with the default store catalog.',
          confirmText: 'Seed Database',
          cancelText: 'Cancel',
          theme: 'primary',
        },
        width: '500px',
        maxWidth: '90vw',
      },
    );

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;

      this.isSeeding.set(true);
      try {
        await this.#navService.seedDefaultNavigation();
        this.isDraftDirty.set(false);
        this.#snackbar.success('Firestore settings/navigation seeded successfully!');
        this.resetDraftFromSource(NAV_CATEGORIES);
      } catch (err) {
        console.error('Failed to seed navigation:', err);
        this.#snackbar.error('Failed to seed navigation.');
      } finally {
        this.isSeeding.set(false);
      }
    });
  }

  discardDraft(): void {
    this.isDraftDirty.set(false);
    this.resetDraftFromSource(this.#navService.categories());
    this.#snackbar.info('Draft discarded. Restored from current active data.');
  }
}
