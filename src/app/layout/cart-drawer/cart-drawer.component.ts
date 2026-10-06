import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { DrawerService } from '../../core/services/drawer/drawer.service';

@Component({
  selector: 'app-cart-drawer',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './cart-drawer.component.html',
  host: {
    class: 'h-full flex flex-col',
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class CartDrawerComponent {
  readonly drawerService = inject(DrawerService);

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
