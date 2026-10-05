import { Component, computed, inject, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '@core/services/theme/theme.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { RouterLink } from '@angular/router';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { PlaygroundTab, PLAYGROUND_TABS } from '../../playground.model';

@Component({
  selector: 'app-playground-header',
  templateUrl: './playground-header.component.html',
  imports: [RouterLink, MatButtonModule, MatTooltipModule, SharedIconModule, HorizontalScrollDirective],
})
export class PlaygroundHeaderComponent {
  readonly activeTab = model<PlaygroundTab>('all');

  protected readonly themeService = inject(ThemeService);
  protected readonly snackbarService = inject(SnackbarService);
  protected readonly isDarkMode = computed(() => this.themeService.isDarkMode());
  protected readonly tabs = PLAYGROUND_TABS;

  protected selectTab(tabId: PlaygroundTab): void {
    this.activeTab.set(tabId);
  }

  protected triggerToast(): void {
    this.snackbarService.success('Record successfully created and validated!', 'View');
  }
}
