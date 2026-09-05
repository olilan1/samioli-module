import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/foundry-fixture.js';
import { createIconic, createCreature } from '../helpers/pf2eFactory.js';
import { setForcedD20, clearForcedD20 } from '../../e2e/helpers/dice-mock.js';
import {
  dropActorToScene,
  selectToken,
  targetToken,
  postActorActionToChat,
  performActorStrike,
  applyEffectToActor,
  removeEffectsFromActor,
  clickChatMessageButton,
  deleteTokensFromScene,
} from '../../e2e/helpers/foundry-helpers.js';

test.describe.configure({ mode: 'serial' });

async function getPanacheState(page: Page, actorNameOrId: string) {
  return await page.evaluate((nameOrId) => {
    interface EffectDoc {
      name: string;
      slug?: string;
      system?: {
        duration?: {
          value?: number;
          unit?: string;
        };
      };
    }
    interface ActorDoc {
      id: string;
      name: string;
      itemTypes?: { effect?: EffectDoc[] };
    }
    interface FoundryGame {
      actors?: {
        find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
      };
    }

    const globalObj = window as unknown as { game?: FoundryGame };
    const actor = globalObj.game?.actors?.find(
      (a) =>
        a.id === nameOrId ||
        a.name.toLowerCase() === nameOrId.toLowerCase()
    );
    const panache = actor?.itemTypes?.effect?.find(
      (e) =>
        e.slug === 'effect-panache' ||
        e.name.toLowerCase().includes('panache')
    );

    if (!panache) return { hasPanache: false };
    return {
      hasPanache: true,
      durationValue: panache.system?.duration?.value,
      durationUnit: panache.system?.duration?.unit,
    };
  }, actorNameOrId);
}

async function waitForPanacheState(
  page: Page,
  actorNameOrId: string,
  expectedHasPanache: boolean,
  expectedDurationValue?: number,
  expectedDurationUnit?: string
) {
  await page.waitForFunction(
    ({ nameOrId, expected, expDuration, expUnit }) => {
      interface EffectDoc {
        name: string;
        slug?: string;
        system?: { duration?: { value?: number; unit?: string } };
      }
      interface ActorDoc {
        id: string;
        name: string;
        itemTypes?: { effect?: EffectDoc[] };
      }
      interface FoundryGame {
        actors?: {
          find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
        };
      }

      const globalObj = window as unknown as { game?: FoundryGame };
      const actor = globalObj.game?.actors?.find(
        (a) =>
          a.id === nameOrId ||
          a.name.toLowerCase() === nameOrId.toLowerCase()
      );
      const panache = actor?.itemTypes?.effect?.find(
        (e) =>
          e.slug === 'effect-panache' ||
          e.name.toLowerCase().includes('panache')
      );

      if (Boolean(panache) !== expected) return false;
      if (
        expDuration !== undefined &&
        panache?.system?.duration?.value !== expDuration
      ) {
        return false;
      }
      if (
        expUnit !== undefined &&
        panache?.system?.duration?.unit !== expUnit
      ) {
        return false;
      }
      return true;
    },
    {
      nameOrId: actorNameOrId,
      expected: expectedHasPanache,
      expDuration: expectedDurationValue,
      expUnit: expectedDurationUnit,
    },
    { timeout: 100000 }
  );

  return await getPanacheState(page, actorNameOrId);
}

async function ensureActorAction(
  page: Page,
  actorNameOrId: string,
  actionName: string
): Promise<void> {
  await page.evaluate(
    async ({ idOrName, actName }) => {
      interface ItemDoc {
        id: string;
        name: string;
        slug?: string;
        toObject(): Record<string, unknown>;
      }
      interface ActorDoc {
        id: string;
        name: string;
        items?: ItemDoc[];
        createEmbeddedDocuments(
          type: string,
          data: unknown[]
        ): Promise<ItemDoc[]>;
      }
      interface CompendiumPack {
        getIndex(): Promise<Array<{ _id: string; name: string; slug?: string }>>;
        getDocument(id: string): Promise<ItemDoc | null>;
      }
      interface FoundryGame {
        actors?: {
          find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
        };
        packs?: {
          get: (id: string) => CompendiumPack | undefined;
        };
      }

      const globalObj = window as unknown as { game?: FoundryGame };
      const actor = globalObj.game?.actors?.find(
        (a) =>
          a.id === idOrName || a.name.toLowerCase() === idOrName.toLowerCase()
      );
      if (!actor) return;

      const existing = actor.items?.find(
        (i) =>
          i.name.toLowerCase() === actName.toLowerCase() ||
          i.slug?.toLowerCase() === actName.toLowerCase()
      );
      if (existing) return;

      const pack =
        globalObj.game?.packs?.get('pf2e.action-macros') ||
        globalObj.game?.packs?.get('pf2e.feats-srd');
      if (pack) {
        const index = await pack.getIndex();
        const entry = index.find(
          (i) =>
            i.name.toLowerCase() === actName.toLowerCase() ||
            i.slug?.toLowerCase() === actName.toLowerCase()
        );
        if (entry) {
          const doc = await pack.getDocument(entry._id);
          if (doc) {
            await actor.createEmbeddedDocuments('Item', [doc.toObject()]);
            return;
          }
        }
      }

      await actor.createEmbeddedDocuments('Item', [
        {
          name: actName,
          type: 'action',
          system: {
            slug: actName.toLowerCase().replace(/\s+/g, '-'),
            actionType: { value: 'action' },
            actions: { value: 1 },
          },
        },
      ]);
    },
    { idOrName: actorNameOrId, actName: actionName }
  );
}

async function prepareScene(page: Page) {
  await clearForcedD20(page);

  await page.evaluate(() => {
    const userProto = (window as unknown as { User?: { prototype: object } })
      .User?.prototype;
    if (userProto) {
      Object.defineProperty(userProto, 'isGM', {
        get: () => true,
        configurable: true,
      });
    }
  });

  const swashbuckler = await createIconic(page, 'swashbuckler');
  const seer = await createCreature(page, 'Girtablilu Seer');

  await ensureActorAction(page, swashbuckler.name, 'Demoralize');
  await ensureActorAction(page, swashbuckler.name, 'Dueling Parry');

  await removeEffectsFromActor(page, { actorNameOrId: swashbuckler.name });
  await removeEffectsFromActor(page, { actorNameOrId: seer.name });

  await dropActorToScene(page, {
    actorName: swashbuckler.name,
    x: 2900,
    y: 2200,
  });
  await dropActorToScene(page, {
    actorName: seer.name,
    x: 3100,
    y: 2200,
  });

  await selectToken(page, swashbuckler.name);
  await targetToken(page, seer.name);

  return { swashbuckler, seer };
}

async function executeDemoralize(
  page: Page,
  actorName: string,
  d20Roll: number
) {
  await setForcedD20(page, d20Roll);

  await page.evaluate(async () => {
    interface SettingsObj {
      get(module: string, key: string): boolean;
      set(module: string, key: string, val: boolean): Promise<unknown>;
    }
    interface FoundryGame {
      settings?: SettingsObj;
    }

    const globalObj = window as unknown as { game?: FoundryGame };
    if (globalObj.game?.settings) {
      const isAutoPanache = globalObj.game.settings.get(
        'samioli-module',
        'automatic_panache_enable'
      );
      if (!isAutoPanache) {
        await globalObj.game.settings.set(
          'samioli-module',
          'automatic_panache_enable',
          true
        );
      }
    }
  });

  const messageId = await postActorActionToChat(page, {
    actorNameOrId: actorName,
    actionName: 'Demoralize',
  });

  await clickChatMessageButton(page, {
    buttonSelector: '[data-pf2-action="demoralize"], [data-pf2-action]',
    messageId,
  });
}

async function prepareDuelingParryStance(page: Page, actorName: string) {
  try {
    const messageId = await postActorActionToChat(page, {
      actorNameOrId: actorName,
      actionName: 'Dueling Parry',
    });
    await clickChatMessageButton(page, {
      buttonSelector:
        '[data-pf2-action="dueling-parry"], [data-pf2-action], button',
      messageId,
    });
  } catch {
    await applyEffectToActor(page, {
      actorNameOrId: actorName,
      effectSlugOrUuid: 'effect-dueling-parry',
    });
  }
}

test.describe('Test Panache Functionality on Demoralize', () => {
  test('Critical Success: should apply Panache to Swashbuckler', async ({
    foundryPage,
  }) => {
    const { swashbuckler } = await prepareScene(foundryPage);
    await executeDemoralize(foundryPage, swashbuckler.name, 20);

    const state = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true
    );
    expect(state.hasPanache).toBe(true);
  });

  test('Success: should apply Panache to Swashbuckler', async ({
    foundryPage,
  }) => {
    const { swashbuckler } = await prepareScene(foundryPage);
    await executeDemoralize(foundryPage, swashbuckler.name, 10);

    const state = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true
    );
    expect(state.hasPanache).toBe(true);
  });

  test('Failure: should apply Panache with 1 round duration', async ({
    foundryPage,
  }) => {
    const { swashbuckler } = await prepareScene(foundryPage);
    await executeDemoralize(foundryPage, swashbuckler.name, 4);

    const state = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true,
      1
    );
    expect(state.hasPanache).toBe(true);
    expect(state.durationValue).toBe(1);
  });

  test('Critical Failure: should NOT apply Panache to Swashbuckler', async ({
    foundryPage,
  }) => {
    const { swashbuckler } = await prepareScene(foundryPage);
    await executeDemoralize(foundryPage, swashbuckler.name, 1);

    const state = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      false
    );
    expect(state.hasPanache).toBe(false);
  });

  test('Upgrade: should upgrade Panache from 1 round to unlimited on success', async ({
    foundryPage,
  }) => {
    const { swashbuckler } = await prepareScene(foundryPage);
    await applyEffectToActor(foundryPage, {
      actorNameOrId: swashbuckler.name,
      effectSlugOrUuid: 'effect-panache',
      customData: {
        name: 'Effect: Panache (1 round)',
        'system.duration.value': 1,
        'system.duration.unit': 'rounds',
        'system.duration.expiry': 'turn-end',
      },
    });

    const state1 = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true,
      1,
      'rounds'
    );
    expect(state1.hasPanache).toBe(true);
    expect(state1.durationValue).toBe(1);
    expect(state1.durationUnit).toBe('rounds');

    await executeDemoralize(foundryPage, swashbuckler.name, 10);

    const state2 = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true,
      undefined,
      'unlimited'
    );
    expect(state2.hasPanache).toBe(true);
    expect(state2.durationUnit).toBe('unlimited');
  });

  test('Finisher Miss: should display button and clear Panache on click', async ({
    foundryPage,
  }) => {
    const { swashbuckler } = await prepareScene(foundryPage);
    await applyEffectToActor(foundryPage, {
      actorNameOrId: swashbuckler.name,
      effectSlugOrUuid: 'effect-panache',
    });

    const stateBefore = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true
    );
    expect(stateBefore.hasPanache).toBe(true);

    await setForcedD20(foundryPage, 4);

    await performActorStrike(foundryPage, {
      actorNameOrId: swashbuckler.name,
      strikeNameOrIndex: 0,
      extraRollOptions: ['finisher'],
    });

    await clickChatMessageButton(foundryPage, {
      buttonSelector: '#remove-panache',
    });

    const stateAfter = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      false
    );
    expect(stateAfter.hasPanache).toBe(false);
  });

  test('Dueling Parry Miss: should grant 1-round Panache when enemy misses', async ({
    foundryPage,
  }) => {
    const { swashbuckler, seer } = await prepareScene(foundryPage);
    await prepareDuelingParryStance(foundryPage, swashbuckler.name);

    await selectToken(foundryPage, seer.name);
    await targetToken(foundryPage, swashbuckler.name);

    await setForcedD20(foundryPage, 2);
    await performActorStrike(foundryPage, {
      actorNameOrId: seer.name,
      strikeNameOrIndex: 0,
    });

    const state = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      true,
      1
    );
    expect(state.hasPanache).toBe(true);
    expect(state.durationValue).toBe(1);

    await removeEffectsFromActor(foundryPage, {
      actorNameOrId: swashbuckler.name,
    });
  });

  test('Dueling Parry Hit: should NOT grant Panache when enemy hits', async ({
    foundryPage,
  }) => {
    const { swashbuckler, seer } = await prepareScene(foundryPage);
    await prepareDuelingParryStance(foundryPage, swashbuckler.name);

    await selectToken(foundryPage, seer.name);
    await targetToken(foundryPage, swashbuckler.name);

    await setForcedD20(foundryPage, 20);
    await performActorStrike(foundryPage, {
      actorNameOrId: seer.name,
      strikeNameOrIndex: 0,
    });

    const state = await waitForPanacheState(
      foundryPage,
      swashbuckler.name,
      false
    );
    expect(state.hasPanache).toBe(false);

    await removeEffectsFromActor(foundryPage, {
      actorNameOrId: swashbuckler.name,
    });
  });

  test.afterEach(async ({ foundryPage }) => {
    await deleteTokensFromScene(foundryPage);
  });
});
