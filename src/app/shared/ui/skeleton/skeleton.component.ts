import { booleanAttribute, Component, input } from '@angular/core';

/**
 * Universal Skeleton Loader (<app-skeleton>)
 *
 * Clean light-mode shimmer placeholder that adapts to any container or aspect ratio
 * (e.g. `aspect-16/9`, `aspect-square`, `aspect-4/5`, `w-full h-120`, or `overlay` to cover a parent card).
 */
@Component({
  selector: 'app-skeleton',
  host: {
    'aria-hidden': 'true',
    class: 'skeleton',
    '[class.skeleton-overlay]': 'overlay()',
    '[class.block]': '!overlay()',
  },
  template: '',
})
export class SkeletonComponent {
  /**
   * When true, renders as an absolute full-bleed veil (`absolute inset-0 size-full z-50`)
   * covering its parent container while an image or card is loading.
   */
  readonly overlay = input(false, { transform: booleanAttribute });
}
