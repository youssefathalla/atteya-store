import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { outsideLinkProblem, type NavTarget } from '@core/services/navigation';
import {
  NavTargetFieldComponent,
  type NavTargetChange,
} from '../../components/nav-target-field/nav-target-field.component';
import { normalizePath } from '../../utils/navigation-manager.utils';

export interface AddLinkDialogData {
  columnTitle?: string;
  isBrand?: boolean;
}

export interface AddLinkDialogResult {
  label: string;
  path: string;
  target: NavTarget | null;
  badge?: string;
  isBrand?: boolean;
}

@Component({
  selector: 'app-add-link-dialog',
  templateUrl: './add-link-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    NavTargetFieldComponent,
  ],
})
export class AddLinkDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddLinkDialogComponent, AddLinkDialogResult | null>);
  readonly data = inject<AddLinkDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly label = signal<string>('');
  readonly path = signal<string>('');
  readonly target = signal<NavTarget | null>(null);
  readonly badge = signal<string>('');
  readonly isBrand = signal<boolean>(this.data?.isBrand ?? false);

  readonly isValid = computed(
    () => this.label().trim().length > 0 && this.path().trim().length > 0 && !this.#badOutsideLink(),
  );

  /** An Outside Link that isn't a full https:// address on another site yet. */
  #badOutsideLink(): boolean {
    const target = this.target();
    return target?.kind === 'url' && outsideLinkProblem(target.url) !== null;
  }

  onTargetChange(change: NavTargetChange): void {
    this.target.set(change.target);
    this.path.set(change.path);
    if (!this.label().trim() && change.name) this.label.set(change.name);
  }

  submit(): void {
    if (!this.isValid()) return;
    this.#dialogRef.close({
      label: this.label().trim(),
      path: normalizePath(this.path().trim()),
      target: this.target(),
      badge: this.badge().trim() || undefined,
      isBrand: this.isBrand() || undefined,
    });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
