import { booleanAttribute, Component, computed, input } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type { IconSize } from '@shared/ui/mat-icon/mat-icon.model';
import { PAYMENT_METHODS, type PaymentMethodId } from './payment-method.model';

/**
 * The mark of one payment method: the InstaPay logo in its brand colours, or our black icons
 * (a card for Card, cash for Cash on Delivery, a bank drawn inline for Bank Transfer). Used by the bag, the checkout
 * payment options and the order confirmation page, so all three match.
 *
 * `md` is about the height of the text (20px); `lg` is the bigger mark of the bag's tiles.
 * Next to the method's name the mark is hidden from screen readers; with `alone` it stands in
 * for the name, so it carries the name as its alt text.
 *
 * The logo is a file shipped with the site (`public/img/payments/`), like `app-logo`, not
 * catalogue media, so it is a plain `<img>` with a fixed `src` and never goes through ImageKit.
 */
@Component({
  selector: 'app-payment-mark',
  imports: [SharedIconModule],
  host: { class: 'elements-center shrink-0' },
  template: `
    @switch (method()) {
      @case ('instapay') {
        <img
          src="/img/payments/instapay.png"
          width="336"
          height="216"
          [alt]="alone() ? name() : ''"
          [attr.aria-hidden]="alone() ? null : 'true'"
          decoding="async"
          [class]="size() === 'lg' ? 'h-11 w-auto' : 'h-5 w-auto'"
        />
      }
      @case ('bank-transfer') {
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          [attr.role]="alone() ? 'img' : null"
          [attr.aria-label]="alone() ? name() : null"
          [attr.aria-hidden]="alone() ? null : 'true'"
          [class]="size() === 'lg' ? 'size-8' : 'size-5'"
        >
          <path d="M3 10l9-6 9 6" />
          <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
        </svg>
      }
      @default {
        <span
          class="elements-center"
          [attr.role]="alone() ? 'img' : null"
          [attr.aria-label]="alone() ? name() : null"
          [attr.aria-hidden]="alone() ? null : 'true'"
        >
          @for (icon of icons(); track icon) {
            <mat-icon [name]="icon" [size]="iconSize()" />
          }
        </span>
      }
    }
  `,
})
export class PaymentMarkComponent {
  readonly method = input.required<PaymentMethodId>();
  readonly size = input<'md' | 'lg'>('md');
  /** The mark is shown without the method's name next to it. */
  readonly alone = input(false, { transform: booleanAttribute });

  readonly name = computed(() => PAYMENT_METHODS[this.method()].name);

  readonly icons = computed(() => {
    const mark = PAYMENT_METHODS[this.method()].mark;
    return mark.kind === 'icons' ? mark.icons : [];
  });

  /** One icon fills the space; two side by side are a step smaller. */
  readonly iconSize = computed<IconSize>(() => {
    const pair = this.icons().length > 1;
    if (this.size() === 'lg') return pair ? '2xl' : '3xl';
    return 'xl';
  });
}
