import { Directive, input, computed, inject, ElementRef } from '@angular/core';
import {
  IconType,
  IconSize,
  ICON_SIZE_CLASSES,
  Weight,
  IconColor,
  DEFAULT_BUTTON_ICON_SIZE,
  DEFAULT_STANDALONE_ICON_SIZE,
} from './mat-icon.model';

@Directive({
  selector: 'mat-icon[size], mat-icon[type], mat-icon[name], mat-icon[color]',
  host: {
    class: 'shrink-0',
    '[class]': 'hostClasses()',
    '[textContent]': 'name()',
    '[style.font-weight]': 'weight()',
    '[attr.iconColor]': 'iconColor()',
  },
})
export class MatIconDirective {
  private readonly el = inject(ElementRef<HTMLElement>);

  readonly name = input.required<string>();
  /**
   * @default outline
   */
  readonly type = input<IconType>('outline');
  /**
   * Explicit icon size override.
   * If omitted:
   * - Defaults to `DEFAULT_BUTTON_ICON_SIZE` ('lg') when placed inside a button.
   * - Defaults to `DEFAULT_STANDALONE_ICON_SIZE` ('2xl') when placed standalone.
   */
  readonly size = input<IconSize>();
  /**
   * @default 700
   */
  readonly weight = input<Weight>('700');
  /**
   * @default Google's default icon color
   */
  readonly iconColor = input<IconColor>();

  private get isInsideButton(): boolean {
    const el = this.el?.nativeElement;
    if (!el) return false;
    if (typeof el.closest === 'function') {
      return !!el.closest('button, a[matButton], a[matIconButton], .mat-mdc-button-base');
    }
    let parent = el.parentElement;
    while (parent) {
      if (
        parent.tagName === 'BUTTON' ||
        parent.hasAttribute?.('matButton') ||
        parent.hasAttribute?.('matIconButton') ||
        parent.classList?.contains('mat-mdc-button-base')
      ) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  readonly hostClasses = computed(() => {
    const classes: string[] = [];

    // 1. Handle Type (Fill vs Outline)
    if (this.type() === 'fill') classes.push('ms-fill');

    // 2. Handle Size (explicit override or button-aware default)
    const effectiveSize =
      this.size() ?? (this.isInsideButton ? DEFAULT_BUTTON_ICON_SIZE : DEFAULT_STANDALONE_ICON_SIZE);
    classes.push(ICON_SIZE_CLASSES[effectiveSize]);

    return classes.join(' ');
  });
}
