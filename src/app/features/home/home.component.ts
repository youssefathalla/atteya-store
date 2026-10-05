import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';

interface FeatureCategory {
  readonly title: string;
  readonly subtitle: string;
  readonly path: string;
  readonly tag: string;
  readonly accent: string;
}

@Component({
  selector: 'app-home',
  imports: [SharedIconModule],
  templateUrl: './home.component.html',
})
export class HomeComponent {}
