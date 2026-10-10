import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-nav-manager-header',
  templateUrl: './nav-manager-header.component.html',
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule],
})
export class NavManagerHeaderComponent {
  readonly isSaving = input<boolean>(false);
  readonly isResetting = input<boolean>(false);

  readonly resetDefaults = output<void>();
  readonly discard = output<void>();
  readonly publish = output<void>();
}
