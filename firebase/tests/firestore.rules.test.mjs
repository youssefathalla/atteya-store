import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-atteya';

describe('firestore.rules', () => {
  /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  async function seed(path, data) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), data);
    });
  }

  it('lets an anonymous visitor read settings/home and settings/navigation', async () => {
    await seed('settings/home', { id: 'home', hero: { layoutCount: 1, slides: [] } });
    await seed('settings/navigation', { id: 'navigation', categories: [], version: 1 });

    const anon = testEnv.unauthenticatedContext().firestore();
    const home = await assertSucceeds(getDoc(doc(anon, 'settings/home')));
    const navigation = await assertSucceeds(getDoc(doc(anon, 'settings/navigation')));

    assert.equal(home.exists(), true);
    assert.equal(navigation.exists(), true);
  });

  it('denies an anonymous visitor write to settings', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(anon, 'settings/home'), { id: 'home', hero: { layoutCount: 1, slides: [] } }),
    );
    await assertFails(setDoc(doc(anon, 'settings/navigation'), { id: 'navigation', categories: [] }));
  });

  it('lets a signed-in user write settings without an admin claim', async () => {
    // No admin custom claim or admins collection exists yet, so any
    // authenticated user is the current write bar.
    const signedIn = testEnv.authenticatedContext('editor-1').firestore();
    await assertSucceeds(
      setDoc(doc(signedIn, 'settings/home'), { id: 'home', hero: { layoutCount: 1, slides: [] } }),
    );
    await assertSucceeds(
      setDoc(doc(signedIn, 'settings/navigation'), {
        id: 'navigation',
        categories: [{ id: 'shoes', label: 'Shoes' }],
      }),
    );
  });

  it('keeps anonymous reads of other collections denied', async () => {
    await seed('orders/order-1', { total: 10 });
    await seed('users/user-1', { email: 'visitor@example.com' });
    await seed('settings/home/private/note', { secret: 'keep' });

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'orders/order-1')));
    await assertFails(getDoc(doc(anon, 'users/user-1')));
    await assertFails(getDoc(doc(anon, 'settings/home/private/note')));
  });

  it('still lets a signed-in user read protected collections', async () => {
    await seed('orders/order-1', { total: 10 });
    await seed('users/user-1', { email: 'visitor@example.com' });

    const signedIn = testEnv.authenticatedContext('shopper-1').firestore();
    await assertSucceeds(getDoc(doc(signedIn, 'orders/order-1')));
    await assertSucceeds(getDoc(doc(signedIn, 'users/user-1')));
  });
});
