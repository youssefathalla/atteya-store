import { Component, signal } from '@angular/core';
import { PlaygroundTab } from './playground.model';
import {
  PlaygroundHeaderComponent,
  ColorsTabComponent,
  TypographyTabComponent,
  ButtonsTabComponent,
  IconsTabComponent,
  BadgesTabComponent,
  FormsTabComponent,
  CardsTabComponent,
  TablesTabComponent,
  DialogsTabComponent,
  LoadersTabComponent,
  BrandingTabComponent,
  GsapTabComponent,
} from './components';

@Component({
  selector: 'app-playground',
  imports: [
    PlaygroundHeaderComponent,
    GsapTabComponent,
    ColorsTabComponent,
    TypographyTabComponent,
    ButtonsTabComponent,
    IconsTabComponent,
    BadgesTabComponent,
    FormsTabComponent,
    CardsTabComponent,
    TablesTabComponent,
    DialogsTabComponent,
    LoadersTabComponent,
    BrandingTabComponent,
  ],
  templateUrl: './playground.component.html',
})
export class PlaygroundComponent {
  protected readonly activeTab = signal<PlaygroundTab>('gsap');
}
