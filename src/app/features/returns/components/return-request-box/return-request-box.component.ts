import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import {
  readReturnOrderLines,
  returnPhotosWhatsappText,
  returnStatusLabel,
  type ReturnStatus,
  type ReturnSummary,
} from '@core/config/returns';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { shortOrderRef } from '@core/services/orders/order-ref';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import { ReturnsService } from '../../services/returns.service';
import { savedReturnRequest } from '../../utils/return-memory';
import { lineDetails, readRequestDetails } from '../../utils/return-request.utils';

/**
 * One return or exchange request on the order page (ATS-292): ref, status steps, the items and
 * what was asked, the refund, and **Cancel Request** / **Send Photos on WhatsApp** while they
 * apply. Reads the order's live `returns` summary, so it changes as staff move the request.
 */
@Component({
  selector: 'app-return-request-box',
  host: { class: 'block w-full' },
  imports: [
    NgOptimizedImage,
    AppImageFallbackDirective,
    MatButtonModule,
    MatProgressSpinnerModule,
    SharedIconModule,
  ],
  templateUrl: './return-request-box.component.html',
})
export class ReturnRequestBoxComponent {
  readonly request = input.required<ReturnSummary>();
  readonly order = input.required<OrderDoc>();
  readonly orderId = input.required<string>();
  /** A guest order's view key; null for the signed-in owner. */
  readonly viewKey = input<string | null>(null);
  /** "24 Nov" while a new request can still be sent; null once the window closed. */
  readonly newUntil = input<string | null>(null);

  readonly #returns = inject(ReturnsService);
  readonly #dialog = inject(MatDialog);
  readonly #snackbar = inject(SnackbarService);

  readonly isCancelling = signal(false);

  readonly statusLabel = computed(() => returnStatusLabel(this.request().status));
  readonly done = computed(() => ['rejected', 'cancelled'].includes(this.request().status));

  /** What the order summary says about this request, else what this browser sent. */
  readonly #details = computed(() => {
    const fromOrder = readRequestDetails(this.order().returns, this.request().id);
    const saved = savedReturnRequest(this.request().id);
    return {
      asked: { ...saved.asked, ...fromOrder.asked },
      storeFault: fromOrder.storeFault ?? saved.storeFault ?? false,
      refundEgp: fromOrder.refundEgp ?? saved.refundEgp ?? null,
      rejectReason: fromOrder.rejectReason ?? null,
    };
  });

  /** Requested → Approved → Received (→ Refund Sent when there is a refund). */
  readonly steps = computed(() => {
    const request = this.request();
    const all: ReturnStatus[] = ['requested', 'approved', 'received'];
    if (request.hasRefund) all.push('refund-sent');
    const reached = all.indexOf(request.status);
    return all.map((status, index) => ({ status, label: returnStatusLabel(status), done: index <= reached }));
  });

  readonly items = computed(() => {
    const lines = readReturnOrderLines(this.order().pricing.lines);
    const asked = this.#details().asked;
    return this.request().items.map((item, index) => {
      const line = lines[item.lineIndex];
      const imagePath = line?.imagePath ?? null;
      const what = item.autoGift
        ? 'Free gift · goes back with it'
        : (asked[String(item.lineIndex)] ?? (item.refund ? 'Refund' : 'Exchange'));
      return {
        key: `${index}:${item.lineIndex}`,
        name: line?.name || 'Item',
        details: line ? lineDetails(line.optionLabels) : '',
        what: `${what} · ×${item.quantity}`,
        imagePath,
        imageSrc: imagePath ? normalizeImageKitPath(imagePath) : '',
      };
    });
  });

  readonly refund = computed(() => {
    const amount = this.#details().refundEgp;
    return amount !== null && this.request().hasRefund ? formatMoney(amount, 'EGP', 0) : null;
  });

  /** One line about where the request is. */
  readonly message = computed(() => {
    const request = this.request();
    const refund = this.refund();
    switch (request.status) {
      case 'requested':
        return "We're looking at your request and will message you on WhatsApp to arrange the courier.";
      case 'approved':
        return 'Our courier will come to your delivery address to collect the items.';
      case 'received':
        if (!request.hasRefund) return 'We got your items. All done.';
        return refund
          ? `We got your items. Your refund of ${refund} is on its way by InstaPay.`
          : 'We got your items. Your refund is on its way by InstaPay.';
      case 'refund-sent':
        return refund
          ? `${refund} sent by InstaPay. All done.`
          : 'Your refund was sent by InstaPay. All done.';
      case 'rejected':
        return '';
      case 'cancelled': {
        const until = this.newUntil();
        return until
          ? `You cancelled this request. You can send a new one until ${until}.`
          : 'You cancelled this request.';
      }
    }
  });

  readonly rejectReason = computed(() =>
    this.request().status === 'rejected' ? this.#details().rejectReason : null,
  );

  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  readonly photosUrl = computed(() => {
    const request = this.request();
    if (!this.#details().storeFault || !['requested', 'approved'].includes(request.status)) return null;
    return whatsappChatUrl(
      STORE_INFO.contact.whatsapp,
      returnPhotosWhatsappText(request.ref, shortOrderRef(this.orderId())),
    );
  });

  async cancel(): Promise<void> {
    if (this.isCancelling()) return;
    const ref = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Cancel this request?',
          message:
            'We will stop your return or exchange. You can send a new request while the 14 days are open.',
          confirmText: 'Cancel Request',
          cancelText: 'Keep Request',
        },
      },
    );
    if (!(await firstValueFrom(ref.afterClosed()))) return;
    this.isCancelling.set(true);
    try {
      await this.#returns.cancelReturnRequest(this.request().id, this.viewKey());
      this.#snackbar.success('Request cancelled.');
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't cancel your request. Please try again.");
    } finally {
      this.isCancelling.set(false);
    }
  }
}
