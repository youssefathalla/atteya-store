import { Component } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  imports: [RouterLink, MatTooltipModule],
  template: `
    <!-- Brand Logo -->
    <a routerLink="/" matTooltip="Home" matTooltipPosition="below">
      <img src="img/logo/logo.png" alt="Atteya Store" class="lg:size-12 size-10" />
    </a>
  `,
})
export class LogoComponent {}
