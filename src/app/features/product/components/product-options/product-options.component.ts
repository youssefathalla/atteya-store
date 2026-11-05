import { Component, input, output } from '@angular/core';
import type { ProductOption } from '@core/services/products';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import type { OptionSelection, ProductView } from '../../models/product-page.model';
import { isValueAvailable } from '../../utils/product-stock.utils';

type OptionValue = ProductOption['values'][number];

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

@Component({
  selector: 'app-product-options',
  imports: [ColorSwatchComponent],
  templateUrl: './product-options.component.html',
  host: { class: 'block w-full' },
})
export class ProductOptionsComponent {
  readonly product = input.required<ProductView>();
  readonly selection = input.required<OptionSelection>();
  readonly disabled = input<boolean>(false);

  readonly picked = output<{ key: string; valueId: string }>();

  available(key: string, valueId: string): boolean {
    return isValueAvailable(this.product(), key, valueId);
  }

  isSelected(key: string, valueId: string): boolean {
    return this.selection()[key] === valueId;
  }

  isDisabled(key: string, valueId: string): boolean {
    return this.disabled() || !this.available(key, valueId);
  }

  optionAriaLabel(key: string, value: OptionValue): string {
    return this.available(key, value.id) ? value.label : `${value.label}, sold out`;
  }

  /** True when this colour option can render a chip (palette id and/or hex). */
  hasColourSwatch(optionKey: string, value: OptionValue): boolean {
    if (optionKey !== 'colour') return false;
    if (value.color === 'multi') return true;
    if (value.color) return true;
    return Boolean(value.swatch && HEX_COLOR_RE.test(value.swatch));
  }

  pick(key: string, valueId: string): void {
    this.picked.emit({ key, valueId });
  }
}
