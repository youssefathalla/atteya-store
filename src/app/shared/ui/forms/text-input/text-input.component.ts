import { Component, input, output } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { InputMode } from '../input.model';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { BaseFormControl } from '../base-form-control.directive';

@Component({
  selector: 'app-text-input',
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule, FormField, SharedIconModule],
  host: { class: 'block w-full' },
  template: `
    <mat-form-field [appearance]="appearance()" [subscriptSizing]="subscriptSizing()" class="w-full">
      <mat-label>{{ label() }}</mat-label>
      @if (prefixIcon()) {
        <button
          matIconButton
          matPrefix
          [attr.aria-label]="prefixAriaLabel() || prefixIcon()!"
          (click)="prefixAction.emit()"
          type="button"
        >
          <mat-icon [name]="prefixIcon()!" />
        </button>
      }
      @if (icon()) {
        <mat-icon matPrefix [name]="icon()!" />
      }
      <input
        matInput
        [formField]="formField()"
        [type]="type()"
        [inputMode]="inputMode()"
        [placeholder]="placeholder()"
      />
      @if (suffixIcon()) {
        <button
          matIconButton
          matSuffix
          [attr.aria-label]="suffixAriaLabel() || suffixIcon()!"
          (click)="suffixAction.emit()"
          type="button"
        >
          <mat-icon [name]="suffixIcon()!" />
        </button>
      }
      @if (showError()) {
        <mat-error>{{ errorMessage() }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class TextInputComponent extends BaseFormControl<string | number> {
  readonly type = input<string>('text');
  readonly inputMode = input<InputMode>('text');
  readonly icon = input<string | null>(null);
  readonly prefixIcon = input<string | null>(null);
  readonly prefixAriaLabel = input<string>();
  readonly prefixAction = output<void>();
  readonly suffixIcon = input<string | null>(null);
  readonly suffixAriaLabel = input<string>();
  readonly suffixAction = output<void>();
}
