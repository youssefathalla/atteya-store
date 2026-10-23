import { Component, computed, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormField } from '@angular/forms/signals';
import { BaseFormControl } from '../base-form-control.directive';

interface SelectViewOption<V> {
  readonly value: V;
  readonly label: string;
  readonly group: string;
}

interface SelectOptionGroup<V> {
  readonly name: string;
  readonly options: readonly SelectViewOption<V>[];
}

@Component({
  selector: 'app-select-input',
  imports: [MatFormFieldModule, MatSelectModule, FormField],
  host: { class: 'block w-full' },
  template: `
    <mat-form-field [appearance]="appearance()" class="w-full">
      <mat-label>{{ label() }}</mat-label>
      <mat-select [formField]="$any(formField())" [multiple]="multiple()" [placeholder]="placeholder()">
        @if (groupKey()) {
          @for (group of groupedOptions(); track group.name) {
            @if (group.name) {
              <mat-optgroup [label]="group.name">
                @for (opt of group.options; track opt.value) {
                  <mat-option [value]="opt.value">
                    {{ opt.label }}
                  </mat-option>
                }
              </mat-optgroup>
            } @else {
              @for (opt of group.options; track opt.value) {
                <mat-option [value]="opt.value">
                  {{ opt.label }}
                </mat-option>
              }
            }
          }
        } @else {
          @for (opt of viewOptions(); track opt.value) {
            <mat-option [value]="opt.value">
              {{ opt.label }}
            </mat-option>
          }
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
  readonly groupKey = input<keyof T>();
  readonly labelPrefix = input('');

  protected readonly viewOptions = computed((): readonly SelectViewOption<V>[] => {
    const options = this.options();
    const valueKey = this.valueKey();
    const labelKey = this.labelKey();
    const groupKey = this.groupKey();
    const prefix = this.labelPrefix();

    return options.map((opt) => {
      const value = (valueKey ? opt[valueKey] : opt) as V;
      const rawLabel = labelKey ? String(opt[labelKey]) : String(opt);
      const label = prefix ? `${prefix}.${rawLabel}` : rawLabel;
      const group = groupKey && opt[groupKey] ? String(opt[groupKey]) : '';
      return { value, label, group };
    });
  });

  protected readonly groupedOptions = computed((): readonly SelectOptionGroup<V>[] => {
    const groups: { name: string; options: SelectViewOption<V>[] }[] = [];
    for (const option of this.viewOptions()) {
      const existing = groups.find((group) => group.name === option.group);
      if (existing) {
        existing.options.push(option);
      } else {
        groups.push({ name: option.group, options: [option] });
      }
    }
    return groups;
  });
}
