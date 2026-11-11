import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import type { OrderDetails } from '../../models/order-admin.model';

/**
 * The items of one order (photo, options, offer, unit and line price, live stock) and the money
 * under them (Subtotal, Shipping, Total). One layout for every width: photo, text, price.
 */
@Component({
  selector: 'app-order-items',
  host: { class: 'block w-full @container' },
  imports: [NgOptimizedImage, RouterLink, AppImageFallbackDirective],
  template: `
    @let d = details();
    <section class="admin-order-box gap-0!" [attr.aria-label]="'Items, ' + d.pieces">
      <h3 class="admin-order-box__title pb-2">Items ({{ d.pieces }})</h3>
      <ul>
        @for (item of d.items; track item.key) {
          <li
            class="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-3 py-3 border-t border-outline-variant"
          >
            <div class="size-14 admin-order-photo">
              @if (item.imagePath; as path) {
                <img
                  [ngSrc]="item.imageSrc"
                  [appImageFallback]="path"
                  [alt]="item.name"
                  width="56"
                  height="56"
                  class="size-full object-contain p-1"
                />
              }
            </div>
            <div class="elements-start-col gap-0.5 min-w-0">
              @if (item.productExists) {
                <a
                  class="font-body-md font-bold! underline-offset-2 hover:underline break-words"
                  [routerLink]="['/admin/products', item.productId]"
                  >{{ item.name }}</a
                >
              } @else {
                <span class="font-body-md font-bold! break-words">{{ item.name }}</span>
              }
              @if (item.gift; as gift) {
                <span class="admin-order-muted">{{ gift }} · × {{ item.quantity }}</span>
              }
              @if (item.options) {
                <span class="admin-order-muted break-words">{{ item.options }}</span>
              }
              @if (item.unit; as unit) {
                <span class="admin-order-muted">{{ unit }}</span>
              }
              @if (item.deal; as deal) {
                <span class="font-label-md font-bold!">Offer · {{ deal }}</span>
              }
              <span class="admin-order-muted" [class.font-bold!]="item.stockStatus !== 'in'"
                >Stock now: {{ item.stock }}</span
              >
            </div>
            <div class="elements-end-col items-end! gap-0.5 text-end whitespace-nowrap">
              @if (item.was; as was) {
                <s class="admin-order-muted">{{ was }}</s>
              }
              <span class="font-body-md font-bold!">{{ item.price }}</span>
            </div>
          </li>
        }
      </ul>

      <dl
        class="elements-start-col items-stretch! gap-2 pt-3 border-t border-outline-variant @xl:ms-auto @xl:w-80"
      >
        @for (row of d.totals; track row.label) {
          <div class="admin-order-pair">
            <dt>{{ row.label }}</dt>
            <dd class="whitespace-nowrap">{{ row.value }}</dd>
          </div>
        }
        <div class="admin-order-pair pt-2 border-t border-primary font-title-md font-bold!">
          <dt>Total</dt>
          <dd class="whitespace-nowrap">{{ d.total }}</dd>
        </div>
        @if (d.totalEgp; as egp) {
          <div class="admin-order-pair admin-order-muted">
            <dt>Total in EGP</dt>
            <dd class="whitespace-nowrap">{{ egp }}</dd>
          </div>
        }
      </dl>
    </section>
  `,
})
export class OrderItemsComponent {
  readonly details = input.required<OrderDetails>();
}
