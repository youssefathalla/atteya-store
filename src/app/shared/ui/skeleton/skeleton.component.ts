import {
  booleanAttribute,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type SkeletonVariant = 'rect' | 'circle' | 'text';
export type SkeletonRounded = 'none' | 'shape' | 'full';

/**
 * Universal Skeleton Loader Component (<app-skeleton>)
 *
 * Provides a monochrome M3 shimmer effect that gracefully scales to any dimension:
 * - Big components: Hero sections, banners, product cards, image placeholders (e.g. `aspect-4/5`, `w-full h-36`).
 * - Small components: Action buttons, pills, chips, badges, avatars (`variant="circle"`), or text paragraphs (`variant="text"`).
 * - Overlay Mode (`overlay="true"`): Absolute veil (`absolute inset-0 size-full z-50`) covering real components and buttons
 *   completely so nothing underneath shows through or can be clicked while loading/refreshing.
 */
@Component({
  selector: 'app-skeleton',
  host: {
    'aria-hidden': 'true',
    '[attr.data-variant]': 'variant()',
    '[class.skeleton]': '!isText() && !inverse()',
    '[class.skeleton-inverse]': '!isText() && inverse()',
    '[class.skeleton-overlay]': 'overlay()',
    '[class.animate-none]': '!animate() && !isText()',
    '[class.rounded-full]': '!isText() && (isCircle() || rounded() === "full")',
    '[class.rounded-none]': '!isText() && rounded() === "none"',
    '[class.block]': '!inline() && !isText() && !overlay()',
    '[class.inline-block]': 'inline() && !isText() && !overlay()',
    '[class.elements-start-col]': 'isText() && !overlay()',
    '[class.gap-2]': 'isText() && !overlay()',
    '[class.w-full]': 'isText() && !computedWidth() && !overlay()',
    '[style.position]': 'overlay() ? "absolute" : null',
    '[style.inset]': 'overlay() ? "0" : null',
    '[style.width]': 'overlay() ? "100%" : computedWidth()',
    '[style.height]': 'overlay() ? "100%" : computedHeight()',
    '[style.z-index]': 'computedZIndex()',
  },
  template: `
    @if (isText() && !overlay()) {
      @for (line of lineArray(); track $index; let isLast = $last) {
        <div
          [class]="shimmerClass()"
          [class.w-4/5]="isLast && lineArray().length > 1"
          [class.w-full]="!isLast || lineArray().length === 1"
          [style.height]="lineHeight()"
        ></div>
      }
    }
  `,
})
export class SkeletonComponent {
  /**
   * Visual shape variant:
   * - 'rect' (default): Rectangular placeholder with `border-shape` radius.
   * - 'circle': Fully circular placeholder (`rounded-full!`) for avatars/icons.
   * - 'text': Typography placeholder with natural line height and multi-line support.
   */
  readonly variant = input<SkeletonVariant>('rect');

  /**
   * Number of lines to render when `variant="text"`.
   * When > 1, the trailing line is styled at 80% width for natural paragraph rendering.
   */
  readonly lines = input<number, number | string>(1, { transform: numberAttribute });

  /**
   * Explicit CSS width override (e.g. '100%', '200px', '4rem').
   * If omitted, sizing inherits from parent container or utility classes (e.g. `w-full`, `w-44`).
   */
  readonly width = input<string | undefined>(undefined);

  /**
   * Explicit CSS height override (e.g. '24px', '200px', '1.5rem').
   * For `variant="text"`, this customizes the height of each line.
   */
  readonly height = input<string | undefined>(undefined);

  /**
   * Shorthand to set identical width and height simultaneously (e.g. '48px', '3rem').
   * Ideal for square or circular avatars/icons.
   */
  readonly size = input<string | undefined>(undefined);

  /**
   * When true, renders as an absolute overlay covering its parent container (`absolute inset-0 size-full`)
   * with a guaranteed high z-index (defaults to 50) so buttons, text, and nested content underneath
   * are completely hidden and unclickable while loading.
   */
  readonly overlay = input<boolean, boolean | string>(false, { transform: booleanAttribute });

  /**
   * Explicit z-index override. When `overlay="true"`, this defaults to 50 to sit above all buttons & content.
   */
  readonly zIndex = input<number | string | undefined>(undefined);

  /**
   * Use inverse shimmer palette for dark surfaces (e.g. black hero banners, dark cards).
   */
  readonly inverse = input<boolean, boolean | string>(false, { transform: booleanAttribute });

  /**
   * Explicit corner radius override ('none' | 'shape' | 'full').
   */
  readonly rounded = input<SkeletonRounded | undefined>(undefined);

  /**
   * Controls continuous shimmer sweeping animation. Defaults to true.
   */
  readonly animate = input<boolean, boolean | string>(true, { transform: booleanAttribute });

  /**
   * When true, renders with `inline-block` display instead of `block`.
   */
  readonly inline = input<boolean, boolean | string>(false, { transform: booleanAttribute });

  //! Computeds
  readonly isText = computed(() => this.variant() === 'text');
  readonly isCircle = computed(() => this.variant() === 'circle');

  readonly computedZIndex = computed(() => {
    if (this.zIndex() !== undefined) {
      return this.zIndex();
    }
    return this.overlay() ? 50 : undefined;
  });

  readonly computedWidth = computed(() => this.width() ?? this.size());
  readonly computedHeight = computed(() => {
    if (this.isText()) return undefined;
    return this.height() ?? this.size();
  });

  readonly lineArray = computed(() => {
    const count = Math.max(1, Math.floor(Number(this.lines()) || 1));
    return Array.from({ length: count });
  });

  readonly lineHeight = computed(() => this.height() ?? '1rem');

  readonly shimmerClass = computed(() => {
    const base = this.inverse() ? 'skeleton-inverse' : 'skeleton';
    return this.animate() ? base : `${base} animate-none!`;
  });
}
