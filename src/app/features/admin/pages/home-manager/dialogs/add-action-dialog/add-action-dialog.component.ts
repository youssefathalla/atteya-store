import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { outsideLinkProblem, type NavTarget } from '@core/services/navigation/nav-target';
import {
  NavTargetFieldComponent,
  type NavTargetChange,
} from '../../../navigation-manager/components/nav-target-field/nav-target-field.component';
import { HeroAction } from '../../models/home-manager.model';

export interface AddActionDialogData {
  readonly action?: HeroAction;
}

export type AddActionDialogResult = HeroAction;

/** A hero button: its label and where it goes, picked like a menu link (ATS-267). */
@Component({
  selector: 'app-add-action-dialog',
  templateUrl: './add-action-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    NavTargetFieldComponent,
  ],
})
export class AddActionDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddActionDialogComponent, AddActionDialogResult | null>);
  readonly data = inject<AddActionDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = computed(() => !!this.data?.action);
  readonly label = signal<string>(this.data?.action?.label ?? '');
  readonly link = signal<string>(this.data?.action?.link ?? '');
  readonly target = signal<NavTarget | undefined>(this.data?.action?.target);

  readonly isValid = computed(() => {
    const target = this.target();
    if (target?.kind === 'url' && outsideLinkProblem(target.url)) return false;
    return this.label().trim().length > 0 && (!!target || this.link().trim().length > 0);
  });

  onTargetChange(change: NavTargetChange): void {
    this.target.set(change.target ?? undefined);
    this.link.set(change.path);
    if (!this.label().trim() && change.name) this.label.set(change.name);
  }

  submit(): void {
    if (!this.isValid()) return;
    const target = this.target();
    this.#dialogRef.close({
      label: this.label().trim(),
      link: this.link().trim(),
      ...(target ? { target } : {}),
    });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
