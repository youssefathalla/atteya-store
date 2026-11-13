import { Component, computed, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormField } from '@angular/forms/signals';
import { BaseFormControl } from '../base-form-control.directive';

interface SelectViewOption<V> {
  readonly value: V;
  readonly label: string;
  /** Only with `levelKey`: 0 = a main item (bold), 1 = an item inside the one above it (pushed in). */
  readonly level: number | null;
  /** Only with `triggerKey`: what the closed box shows when this option is picked. */
  readonly trigger: string;
}

@Component({
  selector: 'app-select-input',
  imports: [MatFormFieldModule, MatSelectModule, FormField],
  host: { class: 'block w-full' },
  template: `
    <mat-form-field [appearance]="appearance()" class="w-full">
      <mat-label>{{ label() }}</mat-label>
      <mat-select [formField]="$any(formField())" [multiple]="multiple()" [placeholder]="placeholder()">
        @if (selectedTrigger(); as trigger) {
          <mat-select-trigger>{{ trigger }}</mat-select-trigger>
        }
        @for (opt of viewOptions(); track opt.value) {
          <mat-option [value]="opt.value">
            @if (opt.level === null) {
              {{ opt.label }}
            } @else if (opt.level === 0) {
              <span class="font-bold!">{{ opt.label }}</span>
            } @else {
              <span class="block pl-6">{{ opt.label }}</span>
            }
          </mat-option>
        }
      </mat-select>
      @if (showError()) {
        <mat-error>{{ errorMessage() }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class SelectInputComponent<T, V = T> extends BaseFormControl<V> {
  readonly options = input.required<readonly T[]>();
  readonly multiple = input(false);

  readonly valueKey = input<keyof T>();
  readonly labelKey = input<keyof T>();
  /**
   * A one-level tree (a main item followed by the items inside it): 0 shows the option in bold,
   * 1 pushes it in under the one above it. Every option stays pickable and shows once.
   */
  readonly levelKey = input<keyof T>();
  /** What the closed box shows for the picked option (for example "Apparel › Shorts"). */
  readonly triggerKey = input<keyof T>();
  readonly labelPrefix = input('');

  protected readonly viewOptions = computed((): readonly SelectViewOption<V>[] => {
    const options = this.options();
    const valueKey = this.valueKey();
    const labelKey = this.labelKey();
    const levelKey = this.levelKey();
    const triggerKey = this.triggerKey();
    const prefix = this.labelPrefix();

    return options.map((opt) => {
      const value = (valueKey ? opt[valueKey] : opt) as V;
      const rawLabel = labelKey ? String(opt[labelKey]) : String(opt);
      const label = prefix ? `${prefix}.${rawLabel}` : rawLabel;
      const level = levelKey ? (Number(opt[levelKey]) > 0 ? 1 : 0) : null;
      const trigger = triggerKey ? String(opt[triggerKey]) : label;
      return { value, label, level, trigger };
    });
  });

  /** Set only when `triggerKey` is given and one option is picked. */
  protected readonly selectedTrigger = computed((): string | null => {
    if (!this.triggerKey() || this.multiple()) return null;
    const value = this.valueState().value();
    return this.viewOptions().find((opt) => opt.value === value)?.trigger ?? null;
  });
}
