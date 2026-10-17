import { Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'rect' | 'circle' | 'text';

@Component({
  selector: 'app-skeleton',
  host: {
    class: 'block',
    'aria-hidden': 'true',
  },
  template: `
    @if (variant() === 'text') {
      <div class="flex flex-col gap-2.5 w-full">
        @for (line of lineIndices(); track line; let isLast = $last) {
          <div
            [class]="shimmerClass()"
            class="h-4"
            [class.w-full]="!isLast || lines() === 1"
            [class.w-2/3]="isLast && lines() > 1"
          ></div>
        }
      </div>
    } @else {
      <div
        [class]="shimmerClass()"
        class="size-full min-h-4"
        [class.bg-circle]="variant() === 'circle'"
      ></div>
    }
  `,
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('rect');
  readonly lines = input<number>(1);
  readonly inverse = input<boolean>(false);

  protected readonly shimmerClass = computed(() =>
    this.inverse() ? 'skeleton-inverse' : 'skeleton',
  );

  protected readonly lineIndices = computed<readonly number[]>(() => {
    const count = Math.max(1, Math.min(20, this.lines()));
    return Array.from({ length: count }, (_, i) => i);
  });
}
