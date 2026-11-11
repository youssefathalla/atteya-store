import { NgOptimizedImage } from '@angular/common';
import { Component, input, output } from '@angular/core';
import type { GiftChoiceView } from '@core/services/cart/cart-gifts';
import type { GiftCardColour } from '@core/services/cart/gift-card-label';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll/horizontal-scroll.directive';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { RowScrollNavComponent } from '@shared/ui/row-scroll-nav';
import { normalizeImageKitPath } from '@shared/utils/image';

/**
 * One step's title and its sideways row of big photo cards (Gift Box and Bundle price picker):
 * drag, swipe or the arrows move it; each card is a button with the product name and colour as
 * `aria-label` and `aria-pressed` for the picked one.
 */
@Component({
  selector: 'app-choice-card-row',
  imports: [
    NgOptimizedImage,
    AppImageFallbackDirective,
    HorizontalScrollDirective,
    RowScrollNavComponent,
    ColorSwatchComponent,
    SharedIconModule,
  ],
  templateUrl: './choice-card-row.component.html',
  host: { class: 'block w-full' },
})
export class ChoiceCardRowComponent {
  /** "1. Your free shirt", "Piece 2". */
  readonly title = input.required<string>();
  readonly choices = input.required<readonly GiftChoiceView[]>();
  readonly pickedId = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  /** Draw the thin line under the row even when it fits (keeps the steps apart). */
  readonly divider = input<boolean>(false);

  readonly picked = output<string>();

  readonly path = normalizeImageKitPath;
  readonly round = Math.round;

  /** "White", "Black and Grey", "Red, White and Blue". */
  colourNames(colours: readonly GiftCardColour[]): string {
    const names = colours.map((colour) => colour.label);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
}
