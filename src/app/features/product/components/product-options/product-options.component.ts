import { Component, input, output } from '@angular/core';
import { COLOR_PALETTE, type ProductOption } from '@core/services/products';
import type { OptionSelection, ProductView } from '../../models/product-page.model';
import { isValueAvailable } from '../../utils/product-stock.utils';

type OptionValue = ProductOption['values'][number];

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

@Component({
  selector: 'app-product-options',
  templateUrl: './product-options.component.html',
  host: { class: 'block w-full' },
})
export class ProductOptionsComponent {
  readonly product = input.required<ProductView>();
  readonly selection = input.required<OptionSelection>();
  readonly disabled = input<boolean>(false);

  readonly picked = output<{ key: string; valueId: string }>();

  available(key: string, valueId: string): boolean {
    return isValueAvailable(this.product(), key, valueId, this.selection());
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

  swatchHex(optionKey: string, value: OptionValue): string | null {
    if (optionKey !== 'colour') return null;
    if (value.swatch && HEX_COLOR_RE.test(value.swatch)) {
      return value.swatch;
    }
    if (value.color) {
      return COLOR_PALETTE.find((entry) => entry.id === value.color)?.swatch ?? null;
    }
    return null;
  }

  pick(key: string, valueId: string): void {
    this.picked.emit({ key, valueId });
  }
}
