import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { NavTarget } from '@core/services/navigation';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  NavTargetFieldComponent,
  type NavTargetChange,
} from '../../components/nav-target-field/nav-target-field.component';
import { NavigationDraftService } from '../../services/navigation-draft.service';
import { normalizePath, noNavPathMessage, suggestNavPath } from '../../utils/navigation-manager.utils';

export interface AddCategoryDialogResult {
  label: string;
  /** Empty with no target: the name only opens its menu. */
  path: string;
  target: NavTarget | null;
}

@Component({
  selector: 'app-add-category-dialog',
  templateUrl: './add-category-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    NavTargetFieldComponent,
  ],
})
export class AddCategoryDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddCategoryDialogComponent, AddCategoryDialogResult | null>);
  readonly #draft = inject(NavigationDraftService);
  readonly #snackbar = inject(SnackbarService);

  readonly label = signal<string>('');
  readonly path = signal<string>('');
  readonly target = signal<NavTarget | null>(null);

  readonly isValid = computed(() => this.label().trim().length > 0);

  onLabelChange(value: string): void {
    this.label.set(value);
  }

  onTargetChange(change: NavTargetChange): void {
    this.target.set(change.target);
    this.path.set(change.path);
    if (!this.label().trim() && change.name) this.label.set(change.name);
  }

  /** ✨: the category the name matches. */
  generateSlug(): void {
    const suggested = suggestNavPath(this.label(), false, this.#draft.catalogForPaths());
    if (!suggested) {
      this.#snackbar.error(noNavPathMessage(this.label() || 'this menu'));
      return;
    }
    const destination = this.#draft.destinationFromPath(suggested);
    this.target.set(destination.target);
    this.path.set(destination.path);
  }

  submit(): void {
    if (!this.isValid()) return;
    this.#dialogRef.close({
      label: this.label().trim(),
      path: this.path().trim() ? normalizePath(this.path().trim()) : '',
      target: this.target(),
    });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
