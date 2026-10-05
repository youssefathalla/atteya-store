import { Component, signal } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  imports: [
    SharedIconModule,
    MatBadgeModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  selector: 'app-navbar-actions',
  templateUrl: './navbar-actions.component.html',
})
export class NavbarActionsComponent {
  protected readonly cartCount = signal<number>(2);

  toggleSearch() {
    console.log('Toggle search');
  }
}
