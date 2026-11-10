import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type { ProductOption } from '@core/services/products';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type { ChoicePrompt, OptionSelection, ProductView } from '../../models/product-page.model';
import { isValueAvailable } from '../../utils/product-stock.utils';

type OptionValue = ProductOption['values'][number];

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

@Component({
  selector: 'app-product-options',
  imports: [ColorSwatchComponent, SharedIconModule],
  templateUrl: './product-options.component.html',
  host: { class: 'block w-full' },
})
export class ProductOptionsComponent {
  readonly product = input.required<ProductView>();
  readonly selection = input.required<OptionSelection>();
  readonly disabled = input<boolean>(false);
  /** Set by the page when Add to Bag is pressed before every choice is made. */
  readonly prompt = input<ChoicePrompt | null>(null);

  readonly picked = output<{ key: string; valueId: string }>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);
  private readonly sizeToggle = viewChild<ElementRef<HTMLButtonElement>>('sizeToggle');

  /** Size list open under "Select a Size". Closed again for every new product. */
  readonly sizeOpen = linkedSignal({ source: () => this.product().id, computation: () => false });

  constructor() {
    effect(() => {
      const prompt = this.prompt();
      // Gift steps share the page prompt; the Gift Box moves focus for those, not the options.
      if (!prompt || !untracked(() => this.#ownsPrompt(prompt.key))) return;
      untracked(() => {
        if (prompt.key === 'size') this.sizeOpen.set(true);
        afterNextRender({ write: () => this.#focusFirstChoice(prompt.key) }, { injector: this.#injector });
      });
    });
  }

  available(key: string, valueId: string): boolean {
    return isValueAvailable(this.product(), key, valueId);
  }

  isSelected(key: string, valueId: string): boolean {
    return this.selection()[key] === valueId;
  }

  isDisabled(key: string, valueId: string): boolean {
    return this.disabled() || !this.available(key, valueId);
  }

  selectedLabel(option: ProductOption): string {
    const id = this.selection()[option.key];
    return option.values.find((value) => value.id === id)?.label ?? '';
  }

  /** "Select a Size" until one is chosen, then "Size: M". */
  sizeButtonLabel(option: ProductOption): string {
    const chosen = this.selectedLabel(option);
    return chosen ? `${option.label}: ${chosen}` : `Select a ${option.label}`;
  }

  /** Colour names the chosen one ("Colour: Navy"); other groups show their own label. */
  groupLabel(option: ProductOption): string {
    const chosen = option.key === 'colour' ? this.selectedLabel(option) : '';
    return chosen ? `${option.label}: ${chosen}` : option.label;
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

  toggleSize(): void {
    this.sizeOpen.update((open) => !open);
  }

  pick(key: string, valueId: string): void {
    this.picked.emit({ key, valueId });
    if (key === 'size') {
      this.sizeOpen.set(false);
      afterNextRender(
        { write: () => this.sizeToggle()?.nativeElement.focus() },
        { injector: this.#injector },
      );
    }
  }

  /** True when the prompt names one of this product's options (gift step keys do not). */
  #ownsPrompt(key: string): boolean {
    return this.product().options.some((option) => option.key === key);
  }

  #focusFirstChoice(key: string): void {
    const group = this.#host.nativeElement.querySelector(`[data-option="${key}"]`);
    const first = group?.querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)');
    (first ?? this.sizeToggle()?.nativeElement)?.focus();
  }
}
