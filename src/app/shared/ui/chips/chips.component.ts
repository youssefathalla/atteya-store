import { Component, input, model } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { IconSize, SharedIconModule } from '../mat-icon';

@Component({
  selector: 'app-chips',
  imports: [MatRippleModule, SharedIconModule],
  template: `
    <ul
      class="elements-center flex-wrap gap-3"
      [class]="hostClass()"
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
    >
      @for (chip of chips(); track chip) {
        <li [class]="listClass()" role="presentation">
          <button
            type="button"
            class="chip"
            matRipple
            role="radio"
            [class]="childrenClass()"
            [matRippleColor]="rippleColor"
            [class.selected]="value() === chip"
            [attr.aria-labelledby]="chip + '-label'"
            [attr.aria-checked]="value() === chip"
            (click)="value.set(chip)"
          >
            <span class="chip-icon-wrapper">
              <span class="flex">
                <mat-icon name="check" [size]="iconSize()" weight="600" />
              </span>
            </span>
            <span class="capitalize" [id]="chip + '-label'">{{ chip }}</span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class ChipsComponent<T> {
  readonly chips = input.required<T[]>();
  readonly value = model.required<T>();
  readonly childrenClass = input<string>('');
  readonly hostClass = input<string>('');
  readonly iconSize = input<IconSize>('xl');
  readonly listClass = input<string>('');
  readonly ariaLabel = input<string>('');

  protected readonly rippleColor = 'color-mix(in srgb, var(--mat-sys-primary) 30%, transparent)';
}
