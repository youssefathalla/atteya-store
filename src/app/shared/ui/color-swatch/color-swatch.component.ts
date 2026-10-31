import { booleanAttribute, Component, computed, input } from '@angular/core';
import { COLOR_PALETTE, type ColorId } from '@core/services/products/catalog-taxonomy';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Closed-palette colour chip. Solid hex for normal colours; four-pane Multi
 * (yellow / red / blue / pink) when `colorId` is `multi`.
 */
@Component({
  selector: 'app-color-swatch',
  host: {
    'aria-hidden': 'true',
    class: 'color-swatch',
    '[class.color-swatch--multi]': 'isMulti()',
    '[class.color-swatch--round]': 'round()',
    '[style.--swatch]': 'solidHex()',
  },
  template: `
    @if (isMulti()) {
      <span class="color-swatch__pane color-swatch__pane--tl"></span>
      <span class="color-swatch__pane color-swatch__pane--tr"></span>
      <span class="color-swatch__pane color-swatch__pane--bl"></span>
      <span class="color-swatch__pane color-swatch__pane--br"></span>
    }
  `,
})
export class ColorSwatchComponent {
  /** Closed palette id. Prefer this over a raw hex when both are known. */
  readonly colorId = input<ColorId | string | null>(null);
  /** Optional hex override for custom / option swatches. Ignored for Multi. */
  readonly swatch = input<string | null>(null);
  /** Circular clip (PDP colour buttons). Default is square with `border-shape`. */
  readonly round = input(false, { transform: booleanAttribute });

  readonly isMulti = computed(() => this.colorId()?.toString() === 'multi');

  readonly solidHex = computed((): string | null => {
    if (this.isMulti()) return null;
    const raw = this.swatch()?.trim() ?? '';
    if (HEX_COLOR_RE.test(raw)) return raw;
    const id = this.colorId();
    if (!id) return null;
    return COLOR_PALETTE.find((entry) => entry.id === id)?.swatch ?? null;
  });
}
