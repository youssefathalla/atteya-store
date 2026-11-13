import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  OnInit,
  PLATFORM_ID,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { MatButtonModule } from '@angular/material/button';
import type { Customer } from '@core/services/customers';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { SavedAddress } from '@core/services/user-profile';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { ErrorPageComponent } from '@shared/ui/error-page';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { CustomersAdminService, type CustomerOrdersPage } from '../services/customers-admin.service';
import {
  customerDate,
  customerDisplayName,
  customerInitial,
  REPEAT_ORDER_COUNT,
} from '../utils/customers-list.utils';
import { CustomerNoteCardComponent } from './components/customer-note-card/customer-note-card.component';
import { CustomerOrdersCardComponent } from './components/customer-orders-card/customer-orders-card.component';
import {
  contactLine,
  customerAddresses,
  customerOrderRow,
  customerWhatsappUrl,
  longDate,
  orderMixLine,
  shortDate,
  sinceLine,
} from './utils/customer-details.utils';

/**
 * Admin → one customer (ATS-278): who they are, how much they bought, every order, the addresses
 * they used and a private staff note. Read from `customers/{customerId}` (ATS-276), their orders
 * by email, the account's saved address and `customerNotes/{customerId}`.
 */
@Component({
  selector: 'app-customer-details-page',
  host: { class: 'block w-full @container' },
  imports: [
    RouterLink,
    MatButtonModule,
    EgpPricePipe,
    ErrorPageComponent,
    SharedIconModule,
    SkeletonComponent,
    CustomerNoteCardComponent,
    CustomerOrdersCardComponent,
  ],
  templateUrl: './customer-details.page.html',
})
export class CustomerDetailsPageComponent implements OnInit {
  readonly #customersAdmin = inject(CustomersAdminService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #now = new Date();

  /** From the `:customerId` route segment. */
  readonly customerId = input.required<string>();

  readonly customerResource = resource({
    params: () => ({ id: this.customerId() }),
    loader: async ({ params }): Promise<Customer | null | undefined> => {
      if (!this.#browser) return undefined;
      return this.#customersAdmin.getCustomer(params.id);
    },
  });

  /** The customer once read; null while loading, after a failure or when there is none. */
  readonly customer = computed(() =>
    this.customerResource.hasValue() ? (this.customerResource.value() ?? null) : null,
  );
  readonly notFound = computed(
    () => this.customerResource.status() === 'resolved' && this.customerResource.value() === null,
  );
  readonly failed = computed(() => this.customerResource.status() === 'error');

  readonly view = computed(() => {
    const customer = this.customer();
    if (!customer) return null;
    const since = customerDate(customer.createdAt);
    const firstOrder = customerDate(customer.firstOrderAt);
    const lastOrder = customerDate(customer.lastOrderAt);
    return {
      customer,
      name: customerDisplayName(customer),
      initial: customerInitial(customer),
      returning: customer.orderCount >= REPEAT_ORDER_COUNT,
      contact: contactLine(customer),
      since: sinceLine(customer, since),
      whatsappUrl: customerWhatsappUrl(customer),
      phone: customer.phone.trim(),
      orderMix: orderMixLine(customer),
      lastOrder: lastOrder ? shortDate(lastOrder, this.#now) : null,
      firstOrder: firstOrder ? `First order ${longDate(firstOrder)}` : 'No orders yet',
    };
  });

  /** Where the orders page being loaded starts (Show More Orders moves it on). */
  readonly #cursor = linkedSignal<unknown, QueryDocumentSnapshot | null>({
    source: this.customer,
    computation: () => null,
  });

  readonly ordersResource = resource({
    params: () => {
      const customer = this.customer();
      return customer ? { customer, after: this.#cursor() } : undefined;
    },
    loader: async ({ params }): Promise<CustomerOrdersPage & { first: boolean }> => {
      const page = await this.#customersAdmin.listOrders(params.customer, params.after);
      return { ...page, first: params.after === null };
    },
  });

  /** Every orders page loaded so far. */
  readonly #pages = linkedSignal<
    { page: (CustomerOrdersPage & { first: boolean }) | undefined; firstPage: boolean },
    readonly CustomerOrdersPage[]
  >({
    source: () => ({
      page: this.ordersResource.hasValue() ? this.ordersResource.value() : undefined,
      firstPage: this.#cursor() === null,
    }),
    computation: ({ page, firstPage }, previous) => {
      if (!page) return firstPage ? [] : (previous?.value ?? []);
      return page.first ? [page] : [...(previous?.value ?? []), page];
    },
  });

  readonly #orders = computed(() => this.#pages().flatMap((page) => page.orders));
  /** Payment Failed orders are left out, like in the Orders count (only a failed card attempt). */
  readonly orderRows = computed(() =>
    this.#orders()
      .filter((order) => order.status !== 'failed')
      .map((order) => customerOrderRow(order, this.#now)),
  );
  readonly #nextCursor = computed(() => this.#pages().at(-1)?.next ?? null);
  readonly hasMoreOrders = computed(() => this.#nextCursor() !== null);
  readonly ordersFirstLoading = computed(
    () => this.ordersResource.isLoading() && this.#cursor() === null && this.#orders().length === 0,
  );
  readonly ordersMoreLoading = computed(() => this.ordersResource.isLoading() && this.#cursor() !== null);
  readonly ordersFailed = computed(() => this.ordersResource.status() === 'error');

  readonly accountAddressResource = resource({
    params: () => {
      const uid = this.customer()?.uid;
      return uid ? { uid } : undefined;
    },
    loader: ({ params }): Promise<SavedAddress | null> => this.#customersAdmin.getAccountAddress(params.uid),
  });

  readonly addresses = computed(() =>
    customerAddresses(
      this.#orders(),
      this.accountAddressResource.hasValue() ? (this.accountAddressResource.value() ?? null) : null,
    ),
  );
  readonly addressesLoading = computed(
    () => this.ordersFirstLoading() || this.accountAddressResource.isLoading(),
  );
  /** The account's saved address couldn't be read; the order addresses still show. */
  readonly accountAddressFailed = computed(() => this.accountAddressResource.status() === 'error');

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Customer | Atteya Admin',
      description: 'One customer: their orders, delivery addresses and a staff note.',
      noindex: true,
    });
  }

  showMoreOrders(): void {
    const next = this.#nextCursor();
    if (next) this.#cursor.set(next);
  }

  retryOrders(): void {
    this.ordersResource.reload();
  }

  async copyPhone(phone: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(phone);
      this.#snackbar.success('Phone number copied.');
    } catch {
      this.#snackbar.info("Couldn't copy. Select the number and copy it instead.");
    }
  }
}
