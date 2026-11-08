import { computed, resource, Service } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { parsePlayerList, PLAYERS_DOC, type Player } from './player.schema';

/**
 * The player list from `settings/players` (Shop's Player filter, the product form and
 * the product page's "More from <player>" link). Read once per visit with `getDoc`;
 * the server read is handed to the browser through the resource `id`.
 */
@Service()
export class PlayerListService {
  readonly #firestore = injectFirestore();

  readonly #list = resource({
    loader: async (): Promise<Player[]> => {
      const snap = await getDoc(doc(this.#firestore, PLAYERS_DOC[0], PLAYERS_DOC[1]));
      return snap.exists() ? parsePlayerList(snap.data()) : [];
    },
    id: 'player-list',
  });

  /** Players in the order staff saved them; empty while loading or when the read failed. */
  readonly players = computed<readonly Player[]>(() =>
    this.#list.hasValue() ? this.#list.value() : [],
  );

  readonly namesById = computed<ReadonlyMap<string, string>>(
    () => new Map(this.players().map((player) => [player.id, player.name])),
  );

  readonly isLoading = this.#list.isLoading;
  readonly error = this.#list.error;
  readonly hasValue = computed(() => this.#list.hasValue());

  nameOf(id: string): string | null {
    return this.namesById().get(id) ?? null;
  }

  /** Read the list again (after the admin saves it). */
  reload(): void {
    this.#list.reload();
  }
}
