import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import {
  isRefundItem,
  readReturnSummaries,
  returnKindLabel,
  returnReasonLabel,
  returnWantsLabel,
  RETURN_NOTE_MAX,
  RETURN_REASONS,
  RETURN_REFUND_TO_MAX,
  wantsFor,
  type ReturnKind,
  type ReturnReason,
  type ReturnWants,
} from '@core/config/returns';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import type { OrderDoc } from '@core/services/orders/order.schema';
import { shortOrderRef } from '@core/services/orders/order-ref';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import { formatMoney } from '@shared/utils/money';
import {
  ReturnsService,
  type RequestReturnItem,
  type ReturnProductChoices,
} from '../../services/returns.service';
import { rememberReturnRequest } from '../../utils/return-memory';
import {
  choiceProblem,
  colourName,
  colourTiles,
  EMPTY_CHOICE,
  kindsFor,
  normalBoxFeeEgp,
  returnPickLines,
  returnPreview,
  sizeChips,
  type ReturnChoice,
  type ReturnPickLine,
} from '../../utils/return-request.utils';

export interface ReturnRequestDialogData {
  readonly orderId: string;
  /** A guest order's view key; null when the signed-in owner sends the request. */
  readonly viewKey: string | null;
  readonly order: OrderDoc;
  /** "24 Nov": the last day a request can be sent. */
  readonly until: string;
}

export interface ReturnRequestDialogResult {
  readonly requestId: string;
  readonly ref: string;
}

/** How the request screen opens: a dialog on desktop, full screen on phone (`_dialog.scss`). */
export const RETURN_REQUEST_DIALOG_CONFIG = {
  width: '40rem',
  maxWidth: '96vw',
  autoFocus: 'first-heading',
  panelClass: 'return-request-pane',
} as const;

type RequestRow = ReturnType<ReturnRequestDialogComponent['rows']>[number];

const FALLBACK_ERROR = "We couldn't send your request. Please try again.";

/**
 * The shopper's Return or Exchange screen (ATS-292): pick items and pieces, say what they want
 * for each, see the refund and courier fee (shared rules in `@core/config/returns`, the same
 * ones `requestReturn` uses), and send. Closes with the new request's id and ref.
 */
@Component({
  selector: 'app-return-request-dialog',
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    AppImageFallbackDirective,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './return-request-dialog.component.html',
})
export class ReturnRequestDialogComponent {
  readonly data = inject<ReturnRequestDialogData>(MAT_DIALOG_DATA);
  readonly #dialogRef =
    inject<MatDialogRef<ReturnRequestDialogComponent, ReturnRequestDialogResult>>(MatDialogRef);
  readonly #returns = inject(ReturnsService);
  readonly #shipping = inject(ShippingSettingsService);

  readonly orderRef = shortOrderRef(this.data.orderId);
  readonly #summaries = readReturnSummaries(this.data.order.returns);
  readonly lines: readonly ReturnPickLine[] = returnPickLines(this.data.order, this.#summaries);
  readonly reasons = RETURN_REASONS;
  readonly noteMax = RETURN_NOTE_MAX;
  readonly refundToMax = RETURN_REFUND_TO_MAX;
  readonly kindLabel = returnKindLabel;
  readonly reasonLabel = returnReasonLabel;
  readonly wantsLabel = returnWantsLabel;
  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  readonly choices = signal<Readonly<Record<number, ReturnChoice>>>({});
  readonly refundTo = signal('');
  readonly note = signal('');
  readonly isSending = signal(false);
  readonly sendError = signal<string | null>(null);

  /** Products needed for the size and colour choices, read when an item asks for one. */
  readonly #productIds = computed(() => {
    const ids = new Set<string>();
    for (const line of this.lines) {
      const choice = this.choices()[line.index];
      if (choice?.picked && (choice.kind === 'different-size' || choice.kind === 'different-colour')) {
        ids.add(line.productId);
      }
    }
    return [...ids].sort();
  });

  readonly #productsResource = resource({
    params: () => {
      const ids = this.#productIds();
      return ids.length > 0 ? { ids } : undefined;
    },
    loader: ({ params }) => this.#returns.choicesFor(params.ids),
  });

  /** Every product read so far, kept while a new one loads so the chips never blink. */
  readonly #products = linkedSignal<
    ReadonlyMap<string, ReturnProductChoices> | undefined,
    ReadonlyMap<string, ReturnProductChoices>
  >({
    source: () => (this.#productsResource.hasValue() ? this.#productsResource.value() : undefined),
    computation: (next, previous) => new Map([...(previous?.value ?? []), ...(next ?? [])]),
  });

  readonly productsFailed = computed(() => !!this.#productsResource.error());

  /** Per line: the choice, the kinds offered and the live size and colour choices. */
  readonly rows = computed(() =>
    this.lines.map((line) => {
      const choice = this.choices()[line.index] ?? EMPTY_CHOICE;
      const loaded = this.#products().get(line.productId);
      const product = loaded?.product ?? null;
      const currentSize = line.selection['size'] ?? null;
      const tiles = colourTiles(product, loaded?.siblings ?? []);
      const colour = choice.colourProductId
        ? (loaded?.siblings.find((other) => other.id === choice.colourProductId) ?? null)
        : null;
      const sizes =
        choice.kind === 'different-colour' ? sizeChips(colour, null) : sizeChips(product, currentSize);
      return {
        line,
        choice,
        kinds: kindsFor(line),
        wants: choice.kind ? wantsFor(choice.kind) : [],
        loading: loaded === undefined,
        missing: loaded !== undefined && product === null,
        sizes,
        soldOutNote: sizes
          .filter((size) => size.soldOut && !size.yours)
          .map((size) => size.label)
          .join(', '),
        tiles,
        differentPrice: tiles
          .filter((tile) => !tile.samePrice)
          .map((tile) => tile.name)
          .join(', '),
        colourName: colour ? colourName(colour) : null,
        hasSizes: choice.kind === 'different-colour' ? (colour ? sizes.length > 0 : null) : sizes.length > 0,
        giftBack: this.preview().gifts.find((gift) => gift.forLine === line.index)?.quantity ?? 0,
      };
    }),
  );

  readonly #picked = computed(() =>
    this.lines
      .map((line) => ({ line, choice: this.choices()[line.index] ?? EMPTY_CHOICE }))
      .filter(({ line, choice }) => choice.picked && line.left > 0),
  );

  readonly preview = computed(() =>
    returnPreview({
      order: this.data.order,
      summaries: this.#summaries,
      items: this.#picked()
        .filter(({ choice }) => choice.kind !== null)
        .map(({ line, choice }) => ({
          lineIndex: line.index,
          quantity: Math.min(choice.quantity, line.left),
          kind: choice.kind as ReturnKind,
          wants: choice.wants,
        })),
      normalBoxFeeEgp: normalBoxFeeEgp(this.#shipping.settings(), this.data.order.pricing.shipping?.boxId),
    }),
  );

  /** True while the courier fee depends on shipping settings that haven't arrived yet. */
  readonly #feeUnknown = computed(
    () => !(this.data.order.pricing.shipping?.priceEgp ?? 0) && this.#shipping.settings() === null,
  );

  /** The summary rows above Send Request. */
  readonly summary = computed(() => {
    const picked = this.#picked().filter(({ choice }) => choice.kind !== null);
    if (picked.length === 0) return null;
    const preview = this.preview();
    const money = preview.money;
    const egp = (amount: number) => formatMoney(amount, 'EGP', 0);
    const rows = picked.map(({ line, choice }) => {
      const refund = isRefundItem(choice.kind as ReturnKind, choice.wants);
      const quantity = Math.min(choice.quantity, line.left);
      return {
        key: line.index,
        label: `${line.name}${quantity > 1 ? ` × ${quantity}` : ''}`,
        value: refund ? egp(preview.refundByLine.get(line.index) ?? 0) : 'Exchange',
      };
    });
    let fee: { label: string; value: string };
    if (money.feePaid === 'free') {
      fee = { label: 'Courier fee', value: "Free, we're sorry about this" };
    } else if (money.feePaid === 'off-refund') {
      fee = { label: 'Courier fee, taken off your refund', value: `− ${egp(money.feeEgp)}` };
    } else {
      fee = { label: 'Courier fee, paid in cash at the door', value: egp(money.feeEgp) };
    }
    // Until the shipping settings arrive the fee (and so the refund after it) isn't known yet.
    const known = preview.storeFault || !this.#feeUnknown();
    return {
      rows,
      fee: known ? fee : null,
      refund: preview.hasRefund && known ? egp(money.refundEgp) : null,
      cashAtDoor: preview.hasRefund && known && money.cashAtDoorEgp > 0 ? egp(money.cashAtDoorEgp) : null,
    };
  });

  readonly needsRefundTo = computed(() => this.preview().hasRefund);

  /** The first thing still missing, in plain words; null when the request can be sent. */
  readonly problem = computed(() => {
    const picked = this.#picked();
    if (picked.length === 0) return 'Choose the items you want to return or exchange.';
    for (const row of this.rows()) {
      if (!row.choice.picked || row.line.left < 1) continue;
      const problem = choiceProblem(row.line, row.choice, row.hasSizes);
      if (problem) return problem;
    }
    if (this.needsRefundTo() && !this.refundTo().trim()) {
      return 'Add your InstaPay number or address so we can send your refund.';
    }
    return null;
  });

  update(index: number, patch: Partial<ReturnChoice>): void {
    this.choices.update((all) => ({ ...all, [index]: { ...(all[index] ?? EMPTY_CHOICE), ...patch } }));
    this.sendError.set(null);
  }

  setKind(index: number, kind: ReturnKind): void {
    this.update(index, { kind, reason: null, wants: null, colourProductId: null, size: null });
  }

  setColour(index: number, productId: string): void {
    this.update(index, { colourProductId: productId, size: null });
  }

  setWants(index: number, wants: ReturnWants): void {
    this.update(index, { wants });
  }

  setReason(index: number, reason: ReturnReason): void {
    this.update(index, { reason });
  }

  step(line: ReturnPickLine, by: number): void {
    const current = this.choices()[line.index]?.quantity ?? 1;
    this.update(line.index, { quantity: Math.max(1, Math.min(line.left, current + by)) });
  }

  readText(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  close(): void {
    if (!this.isSending()) this.#dialogRef.close();
  }

  async send(): Promise<void> {
    if (this.problem() || this.isSending()) return;
    const rows = this.rows().filter((row) => row.choice.picked && row.line.left > 0 && row.choice.kind);
    const items: RequestReturnItem[] = rows.map(({ line, choice }) => {
      const kind = choice.kind as ReturnKind;
      return {
        lineIndex: line.index,
        quantity: Math.min(choice.quantity, line.left),
        kind,
        ...(kind === 'return' && choice.reason ? { reason: choice.reason } : {}),
        ...(choice.wants ? { wants: choice.wants } : {}),
        ...(choice.size ? { size: choice.size } : {}),
        ...(kind === 'different-colour' && choice.colourProductId
          ? { colourProductId: choice.colourProductId }
          : {}),
      };
    });
    const note = this.note().trim();
    const refundTo = this.refundTo().trim();
    this.isSending.set(true);
    this.sendError.set(null);
    this.#dialogRef.disableClose = true;
    try {
      const result = await this.#returns.requestReturn({
        orderId: this.data.orderId,
        ...(this.data.viewKey ? { viewKey: this.data.viewKey } : {}),
        items,
        ...(note ? { note } : {}),
        ...(this.needsRefundTo() && refundTo ? { refundTo } : {}),
      });
      rememberReturnRequest(result.requestId, {
        asked: Object.fromEntries(rows.map((row) => [String(row.line.index), this.#askedLabel(row)])),
        storeFault: this.preview().storeFault,
        refundEgp: this.preview().hasRefund ? this.preview().money.refundEgp : null,
      });
      this.#dialogRef.disableClose = false;
      this.#dialogRef.close(result);
    } catch (error: unknown) {
      this.sendError.set(callableMessage(error) ?? FALLBACK_ERROR);
      this.#dialogRef.disableClose = false;
    } finally {
      this.isSending.set(false);
    }
  }

  /** What was asked, worded like the server's `askedLabel`. */
  #askedLabel(row: RequestRow): string {
    const { choice, line } = row;
    const sizeLabel = row.sizes.find((size) => size.id === choice.size)?.label ?? choice.size ?? '';
    switch (choice.kind) {
      case 'different-size': {
        const current = line.selection['size'];
        const was = row.sizes.find((size) => size.id === current)?.label ?? current ?? '';
        return was ? `Size ${was} → ${sizeLabel}` : `Size ${sizeLabel}`;
      }
      case 'different-colour':
        return `${row.colourName ?? 'Other colour'}${sizeLabel ? ` · Size ${sizeLabel}` : ''}`;
      case 'return':
        return `Return It · ${returnReasonLabel(choice.reason ?? 'other')}`;
      case 'damaged':
        return `Damaged Item · ${returnWantsLabel(choice.wants ?? 'refund')}`;
      case 'wrong-item':
        return `Wrong Item Sent · ${returnWantsLabel(choice.wants ?? 'refund')}`;
      default:
        return '';
    }
  }
}
