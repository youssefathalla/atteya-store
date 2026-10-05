import { Directive, input, computed } from '@angular/core';
import { IconType, IconSize, ICON_SIZE_CLASSES, Weight, IconColor } from './mat-icon.model';

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
  readonly name = input.required<string>();
  /**
   * @default outline
   */
  readonly type = input<IconType>('outline');
  /**
   * @default 2xl
   */
  readonly size = input<IconSize>('2xl');
  /**
   * @default 700
   */
  readonly weight = input<Weight>('700');
  /**
   * @default Google's default icon color
   */
  readonly iconColor = input<IconColor>();

  readonly hostClasses = computed(() => {
    const classes: string[] = [];

    // 1. Handle Type (Fill vs Outline)
    // Default is outline (handled by base CSS), so we only need to add class for fill.
    if (this.type() === 'fill') classes.push('ms-fill');

    // 2. Handle Size (if provided)
    const currentSize = this.size();
    if (currentSize) classes.push(ICON_SIZE_CLASSES[currentSize]);

    return classes.join(' ');
  });
}
