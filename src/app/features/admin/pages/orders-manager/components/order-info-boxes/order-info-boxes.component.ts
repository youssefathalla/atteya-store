import { isPlatformBrowser } from '@angular/common';
import { Component, inject, input, PLATFORM_ID, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { customerIdForEmail } from '@core/services/customers';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { OrderDetails } from '../../models/order-admin.model';

/**
 * The Customer, Delivery and Payment boxes of one order. The host is `display: contents`, so the
 * parent decides the layout: three columns in the opened list row, one column on the order page.
 */
@Component({
  selector: 'app-order-info-boxes',
  host: { class: 'contents' },
  imports: [MatButtonModule, RouterLink],
  template: `
    @let d = details();
    <section class="admin-order-box" aria-label="Customer">
      <h3 class="admin-order-box__title">Customer</h3>
      @if (customerId.hasValue() && customerId.value(); as id) {
        <a class="admin-order-customer-link" [routerLink]="['/admin/customers', id]">{{ d.customer.name }}</a>
      } @else {
        <p class="font-bold! break-words">{{ d.customer.name }}</p>
      }
      @if (d.customer.email; as email) {
        <div class="admin-order-copy">
          <span class="break-all">{{ email }}</span>
          <button
            matButton
            type="button"
            [attr.aria-label]="'Copy email ' + email"
            (click)="copy(email, 'Email')"
          >
            Copy
          </button>
        </div>
      } @else {
        <p class="admin-order-muted">No email saved</p>
      }
      <div class="admin-order-copy">
        <span class="break-all" dir="ltr">{{ d.customer.phone }}</span>
        <button
          matButton
          type="button"
          [attr.aria-label]="'Copy phone number ' + d.customer.phone"
          (click)="copy(d.customer.phone, 'Phone number')"
        >
          Copy
        </button>
      </div>
      <p class="admin-order-muted">{{ d.customer.account }}</p>
    </section>

    <section class="admin-order-box" aria-label="Delivery address">
      <h3 class="admin-order-box__title">Delivery Address</h3>
      <p class="font-bold! break-words">{{ d.customer.name }}</p>
      <address class="not-italic elements-start-col gap-0.5">
        @for (line of d.address.lines; track $index) {
          <span class="break-words">{{ line }}</span>
        }
      </address>
      @if (d.shippingBox; as box) {
        <p class="admin-order-muted">{{ box }}</p>
      }
      <div>
        <button
          matButton="outlined"
          type="button"
          aria-label="Copy delivery address"
          (click)="copy(d.address.copyText, 'Address')"
        >
          Copy Address
        </button>
      </div>
    </section>

    <section class="admin-order-box" aria-label="Payment">
      <h3 class="admin-order-box__title">Payment</h3>
      <p class="font-bold!">{{ d.payment.method }}</p>
      @for (row of d.payment.rows; track row.label) {
        <div class="admin-order-pair">
          <span>{{ row.label }}</span>
          <span [class.font-bold!]="row.strong" class="break-all">{{ row.value }}</span>
        </div>
      }
      @if (d.needsReview) {
        <p class="font-body-sm font-bold!">
          Paid while an item had sold out. Check the stock before you ship.
        </p>
      }
    </section>
  `,
})
export class OrderInfoBoxesComponent {
  readonly #snackbar = inject(SnackbarService);

  readonly details = input.required<OrderDetails>();

  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The customer page id (SHA-256 of the lower-cased order email, ATS-278); null without an email. */
  readonly customerId = resource({
    params: () => {
      const email = this.details().customer.email;
      return email && this.#browser ? { email } : undefined;
    },
    loader: ({ params }) => customerIdForEmail(params.email),
  });

  async copy(text: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.#snackbar.success(`${what} copied.`);
    } catch {
      this.#snackbar.info(`Couldn't copy. Select the text and copy it instead.`);
    }
  }
}
