import { NgOptimizedImage } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import type { CustomerOrderRow } from '../../utils/customer-details.utils';

/** The Orders card on the customer page (ATS-278): newest first, each row opens the order. */
@Component({
  selector: 'app-customer-orders-card',
  host: { class: 'block w-full' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    AppImageFallbackDirective,
    SharedIconModule,
    SkeletonComponent,
  ],
  template: `
    <section class="surface-card w-full" aria-labelledby="customer-orders-title">
      <h2
        id="customer-orders-title"
        class="font-title-md font-bold! px-4 py-4 @3xl:px-5 border-b border-outline-variant"
      >
        Orders ({{ count() }})
      </h2>

      @if (firstLoading()) {
        <div class="elements-start-col items-stretch! gap-2 p-4" aria-hidden="true">
          <app-skeleton class="h-16 w-full" />
          <app-skeleton class="h-16 w-full" />
          <app-skeleton class="h-16 w-full" />
        </div>
      } @else if (failed() && rows().length === 0) {
        <div class="grid gap-3 p-4 @3xl:p-5 justify-items-start" role="alert">
          <p class="font-body-md">We couldn't load the orders.</p>
          <button matButton="outlined" type="button" (click)="retry.emit()">Try Again</button>
        </div>
      } @else if (rows().length === 0) {
        <p class="font-body-md p-4 @3xl:p-5">No orders yet.</p>
      } @else {
        <ul aria-label="Orders">
          @for (row of rows(); track row.id) {
            <li class="customer-order__item">
              <a class="customer-order" [routerLink]="['/admin/orders', row.id]">
                <span class="customer-order__ref">
                  <span class="font-title-sm font-bold!">{{ row.ref }}</span>
                  <span class="font-body-sm text-on-surface-variant">{{ row.date }}</span>
                </span>
                <span class="customer-order__photos" aria-hidden="true">
                  @for (photo of row.photos; track $index) {
                    <span class="size-9 shrink-0 admin-order-photo">
                      <img
                        [ngSrc]="photo.src"
                        [appImageFallback]="photo.path"
                        alt=""
                        width="36"
                        height="36"
                        class="size-full object-contain p-0.5"
                      />
                    </span>
                  }
                </span>
                <span class="customer-order__summary">{{ row.summary }}</span>
                <span class="customer-order__status">
                  <span class="customer-status" [attr.data-tone]="row.statusTone">{{ row.statusName }}</span>
                </span>
                <span class="customer-order__total">{{ row.total }}</span>
                <span class="customer-order__arrow" aria-hidden="true"
                  ><mat-icon name="chevron_right"
                /></span>
              </a>
            </li>
          }
        </ul>

        @if (failed()) {
          <div class="grid gap-3 p-4 @3xl:flex @3xl:items-center border-t border-outline-variant">
            <span class="font-body-md" role="alert">We couldn't load more orders.</span>
            <button matButton="outlined" type="button" (click)="retry.emit()">Try Again</button>
          </div>
        } @else if (hasMore()) {
          <div class="grid p-4 @3xl:justify-items-start border-t border-outline-variant">
            <button
              matButton="outlined"
              type="button"
              [disabled]="moreLoading()"
              [attr.aria-label]="moreLoading() ? 'Loading more orders' : null"
              (click)="showMore.emit()"
            >
              @if (moreLoading()) {
                <mat-progress-spinner mode="indeterminate" diameter="18" />
              } @else {
                <span>Show More Orders</span>
              }
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class CustomerOrdersCardComponent {
  readonly rows = input.required<readonly CustomerOrderRow[]>();
  /** The customer's order count (Payment Failed left out), for the title. */
  readonly count = input.required<number>();
  readonly firstLoading = input(false);
  readonly moreLoading = input(false);
  readonly failed = input(false);
  readonly hasMore = input(false);

  readonly showMore = output<void>();
  readonly retry = output<void>();
}
