import type { ComponentType } from '@angular/cdk/portal';
import { inject, Service } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { callableMessage, isFirebaseError } from '@shared/utils/firebase/firebase-errors';
import {
  DeleteBlockedDialogComponent,
  type DeleteBlockedDialogData,
  type DeleteBlockedDialogResult,
} from '../dialogs/delete-blocked-dialog/delete-blocked-dialog.component';
import { deleteConfirmMessage, type CatalogKind } from '../utils/catalog-manager.utils';
import { CatalogAdminService } from './catalog-admin.service';

/** A category or brand row the ⋮ Delete was pressed on. */
export interface DeleteTarget {
  readonly id: string;
  readonly name: string;
  readonly published: boolean;
  /** Its store address: `/category/<path>` or `/brand/<slug>`. */
  readonly address: string;
}

/** `deleted`: reload the list; `hide`: the person chose Hide Instead; `none`: nothing changed. */
export type DeleteFlowOutcome = 'deleted' | 'hide' | 'none';

/**
 * The ⋮ Delete on Categories & Brands (ATS-265), shared by both tabs. Asks the server first: an
 * empty category or brand (built-in or not) can be deleted; one with products or categories inside
 * gets the reason with See These Products and Hide Instead. The confirm window lists the offers
 * that stop including it. After the delete, its menu links are taken out of Navigation.
 */
@Service()
export class CatalogDeleteFlowService {
  readonly #catalog = inject(CatalogAdminService);
  readonly #dialog = inject(MatDialog);
  readonly #router = inject(Router);
  readonly #snackbar = inject(SnackbarService);

  async run(kind: CatalogKind, item: DeleteTarget): Promise<DeleteFlowOutcome> {
    try {
      const check = await this.#catalog.checkDelete(kind, item.id);
      if (check.blocked) return this.#blocked(kind, item, check.blocked, check.products > 0);

      const noun = kind === 'categories' ? 'Category' : 'Brand';
      const confirmed = await this.#open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
        ConfirmDialogComponent,
        {
          title: `Delete ${item.name}?`,
          message: deleteConfirmMessage(check.offers),
          confirmText: `Delete ${noun}`,
          cancelText: 'Keep It',
          theme: 'error',
        },
      );
      if (!confirmed) return 'none';

      await this.#catalog.delete(kind, item.id);
      try {
        await this.#catalog.removeFromMenu({
          kind: kind === 'categories' ? 'category' : 'brand',
          id: item.id,
          address: item.address,
        });
        this.#snackbar.success(`${item.name} was deleted.`);
      } catch {
        this.#snackbar.warning(
          `${item.name} was deleted, but the menu didn't update. Open Navigation and remove its link there.`,
          'Close',
          8000,
        );
      }
      return 'deleted';
    } catch (error: unknown) {
      // Something was added to it between the check and the delete: same reason, same choices.
      if (isFirebaseError(error) && error.code === 'functions/failed-precondition') {
        const reason = callableMessage(error);
        if (reason) {
          const products = await this.#catalog
            .checkDelete(kind, item.id)
            .then((check) => check.products > 0)
            .catch(() => false);
          return this.#blocked(kind, item, reason, products);
        }
      }
      const noun = kind === 'categories' ? 'category' : 'brand';
      this.#snackbar.error(callableMessage(error) ?? `We couldn't delete that ${noun}. Please try again.`);
      return 'none';
    }
  }

  async #blocked(
    kind: CatalogKind,
    item: DeleteTarget,
    reason: string,
    hasProducts: boolean,
  ): Promise<DeleteFlowOutcome> {
    const canSeeProducts = kind === 'categories' && hasProducts;
    if (!item.published && !canSeeProducts) {
      this.#snackbar.info(reason, 'Close', 6000);
      return 'none';
    }
    const choice = await this.#open<
      DeleteBlockedDialogComponent,
      DeleteBlockedDialogData,
      DeleteBlockedDialogResult
    >(DeleteBlockedDialogComponent, {
      title: `${item.name} can’t be deleted`,
      message: reason,
      canSeeProducts,
      canHide: item.published,
    });
    if (choice === 'products') {
      await this.#router.navigate(['/admin/products'], { queryParams: { category: item.id } });
      return 'none';
    }
    return choice === 'hide' ? 'hide' : 'none';
  }

  #open<C, D, R>(component: ComponentType<C>, data: D): Promise<R | undefined> {
    const ref = this.#dialog.open<C, D, R>(component, { data, width: '28rem', maxWidth: '92vw' });
    return firstValueFrom(ref.afterClosed());
  }
}
