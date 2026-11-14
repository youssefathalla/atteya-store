import { isPlatformBrowser } from '@angular/common';
import { Component, inject, input, PLATFORM_ID, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { returnStatusLabel } from '@core/config/returns';
import { ReturnsAdminService } from '../../../returns-manager/services/returns-admin.service';

/**
 * The order's Returns line (ATS-293): each return or exchange request's ref and status, linking to
 * `/admin/returns/:id`. Shows nothing when the order has none.
 */
@Component({
  selector: 'app-order-returns-line',
  host: { class: 'contents' },
  imports: [RouterLink],
  template: `
    @if (requests.hasValue() && requests.value().length > 0) {
      <p class="admin-order-box elements-start flex-row! flex-wrap gap-x-3 gap-y-1">
        <span class="font-bold!">Returns:</span>
        @for (request of requests.value(); track request.id) {
          <a class="admin-order-customer-link" [routerLink]="['/admin/returns', request.id]"
            >{{ request.ref }} · {{ label(request.status) }}</a
          >
        }
      </p>
    }
  `,
})
export class OrderReturnsLineComponent {
  readonly #returns = inject(ReturnsAdminService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly orderId = input.required<string>();

  readonly requests = resource({
    params: () => (this.#browser ? this.orderId() : undefined),
    loader: ({ params }) => this.#returns.requestsForOrder(params),
  });

  readonly label = returnStatusLabel;
}
