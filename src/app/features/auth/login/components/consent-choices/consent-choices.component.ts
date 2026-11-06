import { Component, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';

/**
 * Terms (required) and offer emails (optional) for a new account.
 * Labels are native `<label for>` beside a label-less `mat-checkbox`, so long
 * text wraps under itself and the box stays on the first line.
 */
@Component({
  selector: 'app-consent-choices',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatCheckboxModule],
  templateUrl: './consent-choices.component.html',
})
export class ConsentChoicesComponent {
  readonly termsAccepted = model.required<boolean>();
  readonly marketingOptIn = model.required<boolean>();
  readonly disabled = input(false);
}
