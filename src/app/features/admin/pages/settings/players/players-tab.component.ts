import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { PlayerListService } from '@core/services/products/player-list.service';
import {
  isPlayerId,
  MAX_PLAYER_NAME,
  MAX_PLAYERS,
  parsePlayerList,
  playerIdFromName,
  PLAYERS_DOC,
  type Player,
} from '@core/services/products/player.schema';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

interface PlayerDraft {
  readonly id: string;
  readonly name: string;
  /** Added on this page and not saved yet. */
  readonly isNew: boolean;
}

/**
 * Settings → Players: the list behind Shop's Player filter and the product form's
 * Players picker (`settings/players`). A saved player's link name never changes,
 * because products and shared links point at it.
 */
@Component({
  selector: 'app-players-tab',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule, SkeletonComponent],
  templateUrl: './players-tab.component.html',
})
export class PlayersTabComponent implements OnInit {
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #playerList = inject(PlayerListService);

  readonly maxName = MAX_PLAYER_NAME;
  readonly draft = signal<readonly PlayerDraft[]>([]);
  readonly isSaving = signal(false);
  readonly newName = signal('');
  readonly newId = signal('');
  readonly addError = signal('');
  /** True once staff typed the link name themselves; until then it follows the name. */
  #idEdited = false;

  readonly listResource = resource({
    loader: async (): Promise<Player[] | null> => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const snap = await getDoc(doc(this.#firestore, PLAYERS_DOC[0], PLAYERS_DOC[1]));
      return snap.exists() ? parsePlayerList(snap.data()) : [];
    },
  });

  readonly isFull = computed(() => this.draft().length >= MAX_PLAYERS);

  constructor() {
    effect(() => {
      const list = this.listResource.value();
      if (!list) return;
      untracked(() =>
        this.draft.set(list.map((player) => ({ id: player.id, name: player.name, isNew: false }))),
      );
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Players | Atteya Admin',
      description: 'The players shoppers can filter Shop by.',
      noindex: true,
    });
  }

  textFrom(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onNewName(value: string): void {
    this.newName.set(value);
    if (!this.#idEdited) this.newId.set(playerIdFromName(value));
    this.addError.set('');
  }

  onNewId(value: string): void {
    this.#idEdited = value.trim().length > 0;
    this.newId.set(value.trim().toLowerCase());
    this.addError.set('');
  }

  rename(index: number, name: string): void {
    this.draft.update((list) => list.map((player, i) => (i === index ? { ...player, name } : player)));
  }

  remove(index: number): void {
    this.draft.update((list) => list.filter((_, i) => i !== index));
  }

  add(): void {
    const name = this.newName().trim();
    const id = this.newId().trim();
    if (name.length === 0) {
      this.addError.set("Enter the player's name.");
      return;
    }
    if (name.length > MAX_PLAYER_NAME) {
      this.addError.set(`Keep the name to ${MAX_PLAYER_NAME} characters or fewer.`);
      return;
    }
    if (!isPlayerId(id)) {
      this.addError.set('The link name uses lowercase letters, numbers and dashes, like ale-galan.');
      return;
    }
    if (this.draft().some((player) => player.id === id)) {
      this.addError.set('A player already uses that link name.');
      return;
    }
    if (this.isFull()) {
      this.addError.set(`The list holds up to ${MAX_PLAYERS} players.`);
      return;
    }
    this.draft.update((list) => [...list, { id, name, isNew: true }]);
    this.newName.set('');
    this.newId.set('');
    this.#idEdited = false;
    this.addError.set('');
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const players = this.draft().map((player) => ({ id: player.id, name: player.name.trim() }));
    if (players.some((player) => player.name.length === 0)) {
      this.#snackbar.error('Give every player a name.');
      return;
    }
    if (players.some((player) => player.name.length > MAX_PLAYER_NAME)) {
      this.#snackbar.error(`Keep each name to ${MAX_PLAYER_NAME} characters or fewer.`);
      return;
    }

    this.isSaving.set(true);
    try {
      await setDoc(
        doc(this.#firestore, PLAYERS_DOC[0], PLAYERS_DOC[1]),
        {
          players,
          updatedAt: serverTimestamp(),
          updatedBy: this.#auth.user()?.uid ?? 'admin',
        },
        { merge: true },
      );
      this.draft.set(players.map((player) => ({ ...player, isNew: false })));
      this.#playerList.reload();
      this.#snackbar.success('Players saved.');
    } catch {
      this.#snackbar.error("We couldn't save the players. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }
}
