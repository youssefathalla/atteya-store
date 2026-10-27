import { Component } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  imports: [RouterLink, MatTooltipModule],
  template: `
    <!-- Brand Logo -->
    <a routerLink="/" matTooltip="Home" matTooltipPosition="below">
      <img src="img/logo/logo.webp" alt="Atteya Store" width="40" height="40" class="size-10" />
    </a>
  `,
})
export class LogoComponent {}
