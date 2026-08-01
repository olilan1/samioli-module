import { test, expect } from './helpers/shared-test.js';
import { setForcedD20, clearForcedD20 } from './helpers/dice-mock.js';
import {
  dropActorToScene,
  selectToken,
  targetToken,
  postActorActionToChat,
  performActorStrike,
  clickChatMessageButton,
  deleteTokensFromScene,
} from './helpers/foundry-helpers.js';

test.describe.configure({ mode: 'serial' });

async function clearPanacheEffect(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.evaluate(async () => {
    interface EffectDoc {
      id: string;
      name: string;
      slug?: string;
    }
    interface ActorDoc {
      name: string;
      itemTypes?: { effect?: EffectDoc[] };
      deleteEmbeddedDocuments(
        type: string,
        ids: string[]
      ): Promise<unknown>;
    }
    interface FoundryGame {
      actors?: {
        find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
      };
    }

    const globalObj = window as unknown as { game?: FoundryGame };
    const sayf = globalObj.game?.actors?.find(
      (a) => a.name.toLowerCase() === 'sayf mujalid'
    );
    if (!sayf) return;

    const panacheEffects =
      sayf.itemTypes?.effect?.filter(
        (e) =>
          e.slug === 'effect-panache' ||
          e.name.toLowerCase().includes('panache')
      ) || [];

    if (panacheEffects.length > 0) {
      await sayf.deleteEmbeddedDocuments(
        'Item',
        panacheEffects.map((e) => e.id)
      );
    }
  });
}

async function getPanacheState(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
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
      name: string;
      itemTypes?: { effect?: EffectDoc[] };
    }
    interface FoundryGame {
      actors?: {
        find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
      };
    }

    const globalObj = window as unknown as { game?: FoundryGame };
    const sayf = globalObj.game?.actors?.find(
      (a) => a.name.toLowerCase() === 'sayf mujalid'
    );
    const panache = sayf?.itemTypes?.effect?.find(
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
  });
}

async function waitForPanacheState(
  page: import('@playwright/test').Page,
  expectedHasPanache: boolean,
  expectedDurationValue?: number,
  expectedDurationUnit?: string
) {
  await page.waitForFunction(
    ({ expected, expDuration, expUnit }) => {
      interface EffectDoc {
        name: string;
        slug?: string;
        system?: { duration?: { value?: number; unit?: string } };
      }
      interface ActorDoc {
        name: string;
        itemTypes?: { effect?: EffectDoc[] };
      }
      interface FoundryGame {
        actors?: {
          find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
        };
      }

      const globalObj = window as unknown as { game?: FoundryGame };
      const sayf = globalObj.game?.actors?.find(
        (a) => a.name.toLowerCase() === 'sayf mujalid'
      );
      const panache = sayf?.itemTypes?.effect?.find(
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
      expected: expectedHasPanache,
      expDuration: expectedDurationValue,
      expUnit: expectedDurationUnit,
    },
    { timeout: 10000 }
  );

  return await getPanacheState(page);
}

async function prepareScene(page: import('@playwright/test').Page) {
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

  await clearPanacheEffect(page);
  await dropActorToScene(page, {
    actorName: 'Sayf Mujalid',
    x: 2900,
    y: 2200,
  });
  await dropActorToScene(page, {
    actorName: 'Girtablilu Seer',
    x: 3100,
    y: 2200,
  });
  await selectToken(page, 'Sayf Mujalid');
  await targetToken(page, 'Girtablilu Seer');
}

async function executeDemoralize(
  page: import('@playwright/test').Page,
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
    actorNameOrId: 'Sayf Mujalid',
    actionName: 'Demoralize',
  });

  await clickChatMessageButton(page, {
    buttonSelector: '[data-pf2-action="demoralize"], [data-pf2-action]',
    messageId,
  });
}

async function prepareDuelingParryStance(
  page: import('@playwright/test').Page
) {
  try {
    const messageId = await postActorActionToChat(page, {
      actorNameOrId: 'Sayf Mujalid',
      actionName: 'Dueling Parry',
    });
    await clickChatMessageButton(page, {
      buttonSelector:
        '[data-pf2-action="dueling-parry"], [data-pf2-action], button',
      messageId,
    });
  } catch {
    await page.evaluate(async () => {
      interface ItemObj {
        system?: { slug?: string };
        toObject(): unknown;
      }
      interface ActorDoc {
        name: string;
        createEmbeddedDocuments(
          type: string,
          data: unknown[]
        ): Promise<unknown>;
      }
      interface CompendiumPack {
        getDocuments(): Promise<ItemObj[]>;
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
      const sayf = globalObj.game?.actors?.find(
        (a) => a.name.toLowerCase() === 'sayf mujalid'
      );
      const pack = globalObj.game?.packs?.get('pf2e.feat-effects');
      if (!sayf || !pack) return;

      const docs = await pack.getDocuments();
      const effect = docs.find(
        (d) => d.system?.slug === 'effect-dueling-parry'
      );
      if (effect) {
        await sayf.createEmbeddedDocuments('Item', [effect.toObject()]);
      }
    });
  }
}

test.describe('Test Panache Functionality on Demoralize', () => {
  test('Critical Success: should apply Panache to Sayf', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await executeDemoralize(sharedPage, 20);

    const state = await waitForPanacheState(sharedPage, true);
    expect(state.hasPanache).toBe(true);
  });

  test('Success: should apply Panache to Sayf', async ({ sharedPage }) => {
    await prepareScene(sharedPage);
    await executeDemoralize(sharedPage, 10);

    const state = await waitForPanacheState(sharedPage, true);
    expect(state.hasPanache).toBe(true);
  });

  test('Failure: should apply Panache with 1 round duration', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await executeDemoralize(sharedPage, 4);

    const state = await waitForPanacheState(sharedPage, true, 1);
    expect(state.hasPanache).toBe(true);
    expect(state.durationValue).toBe(1);
  });

  test('Critical Failure: should NOT apply Panache to Sayf', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await executeDemoralize(sharedPage, 1);

    const state = await waitForPanacheState(sharedPage, false);
    expect(state.hasPanache).toBe(false);
  });

  test('Upgrade: should upgrade Panache from 1 round to unlimited on success', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await executeDemoralize(sharedPage, 4);

    const state1 = await waitForPanacheState(sharedPage, true, 1, 'rounds');
    expect(state1.hasPanache).toBe(true);
    expect(state1.durationValue).toBe(1);
    expect(state1.durationUnit).toBe('rounds');

    await executeDemoralize(sharedPage, 10);

    const state2 = await waitForPanacheState(
      sharedPage,
      true,
      undefined,
      'unlimited'
    );
    expect(state2.hasPanache).toBe(true);
    expect(state2.durationUnit).toBe('unlimited');
  });

  test('Finisher Miss: should display button and clear Panache on click', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await executeDemoralize(sharedPage, 4);

    const stateBefore = await waitForPanacheState(sharedPage, true, 1);
    expect(stateBefore.hasPanache).toBe(true);

    await setForcedD20(sharedPage, 4);

    await performActorStrike(sharedPage, {
      actorNameOrId: 'Sayf Mujalid',
      strikeNameOrIndex: 0,
      extraRollOptions: ['finisher'],
    });

    await clickChatMessageButton(sharedPage, {
      buttonSelector: '#remove-panache',
    });

    const stateAfter = await waitForPanacheState(sharedPage, false);
    expect(stateAfter.hasPanache).toBe(false);
  });

  test('Dueling Parry Miss: should grant 1-round Panache when enemy misses', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await prepareDuelingParryStance(sharedPage);

    await selectToken(sharedPage, 'Girtablilu Seer');
    await targetToken(sharedPage, 'Sayf Mujalid');

    await setForcedD20(sharedPage, 2);
    await performActorStrike(sharedPage, {
      actorNameOrId: 'Girtablilu Seer',
      strikeNameOrIndex: 0,
    });

    const state = await waitForPanacheState(sharedPage, true, 1);
    expect(state.hasPanache).toBe(true);
    expect(state.durationValue).toBe(1);
  });

  test('Dueling Parry Hit: should NOT grant Panache when enemy hits', async ({
    sharedPage,
  }) => {
    await prepareScene(sharedPage);
    await prepareDuelingParryStance(sharedPage);

    await selectToken(sharedPage, 'Girtablilu Seer');
    await targetToken(sharedPage, 'Sayf Mujalid');

    await setForcedD20(sharedPage, 20);
    await performActorStrike(sharedPage, {
      actorNameOrId: 'Girtablilu Seer',
      strikeNameOrIndex: 0,
    });

    const state = await waitForPanacheState(sharedPage, false);
    expect(state.hasPanache).toBe(false);
  });

  test.afterAll(async ({ sharedPage }) => {
    await deleteTokensFromScene(sharedPage, [
      'Sayf Mujalid',
      'Girtablilu Seer',
    ]);
  });
});
