import { Component, signal } from '@angular/core';
import { PlaygroundComponent } from '@features/playground/playground.component';

@Component({
  selector: 'app-root',
  imports: [PlaygroundComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('atteya-store');
}
