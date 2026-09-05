import { Page } from '@playwright/test';

export interface PF2eActorResult {
  id: string;
  name: string;
}

/**
 * Creates an iconic actor from PF2e system compendiums.
 */
export async function createIconic(
  page: Page,
  className: string
): Promise<PF2eActorResult> {
  return page.evaluate(async (cls) => {
    const pack = game.packs.get('pf2e.premade-actors');
    let sourceData: Record<string, unknown> | null = null;
    if (pack) {
      const index = await pack.getIndex();
      const entry = index.find((i) =>
        i.name.toLowerCase().includes(cls.toLowerCase())
      );
      if (entry) {
        const doc = await pack.getDocument(entry._id);
        if (doc) {
          sourceData = doc.toObject() as Record<string, unknown>;
        }
      }
    }
    const fullTitle = `[TEST] Iconic ${cls}`;
    const actorData = sourceData
      ? { ...sourceData, name: fullTitle, type: 'character' }
      : { name: fullTitle, type: 'character' };
    const actor = await Actor.create(actorData);
    return { id: actor?.id ?? '', name: fullTitle };
  }, className);
}

/**
 * Creates a familiar actor linked to a master actor.
 */
export async function createFamiliar(
  page: Page,
  name: string,
  masterId: string
): Promise<PF2eActorResult> {
  return page.evaluate(
    async ({ familiarName, master }) => {
      const fullTitle = `[TEST] ${familiarName}`;
      const actor = await Actor.create({
        name: fullTitle,
        type: 'familiar',
        system: {
          master: {
            id: master,
          },
        },
      });
      return { id: actor?.id ?? '', name: fullTitle };
    },
    { familiarName: name, master: masterId }
  );
}

/**
 * Creates an Eidolon character setup actor.
 */
export async function createEidolon(
  page: Page,
  name: string
): Promise<PF2eActorResult> {
  return page.evaluate(async (eidolonName) => {
    const fullTitle = `[TEST] ${eidolonName}`;
    const actor = await Actor.create({
      name: fullTitle,
      type: 'character',
      system: {
        details: {
          class: { value: 'eidolon' },
        },
      },
    });
    return { id: actor?.id ?? '', name: fullTitle };
  }, name);
}

/**
 * Imports a creature from bestiary or creates an NPC actor.
 */
export async function createCreature(
  page: Page,
  name: string
): Promise<PF2eActorResult> {
  return page.evaluate(async (monsterName) => {
    const pack = game.packs.get('pf2e.pathfinder-bestiary');
    let sourceData: Record<string, unknown> | null = null;
    if (pack) {
      const index = await pack.getIndex();
      const entry = index.find((i) =>
        i.name.toLowerCase().includes(monsterName.toLowerCase())
      );
      if (entry) {
        const doc = await pack.getDocument(entry._id);
        if (doc) {
          sourceData = doc.toObject() as Record<string, unknown>;
        }
      }
    }
    const fullTitle = `[TEST] ${monsterName}`;
    const actorData = sourceData
      ? { ...sourceData, name: fullTitle, type: 'npc' }
      : { name: fullTitle, type: 'npc' };
    const actor = await Actor.create(actorData);
    return { id: actor?.id ?? '', name: fullTitle };
  }, name);
}

/**
 * Deletes all actors starting with [TEST].
 */
export async function cleanupTestActors(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const testActors = game.actors.filter((a) =>
      a.name.startsWith('[TEST]')
    );
    let count = 0;
    for (const actor of testActors) {
      await actor.delete();
      count++;
    }
    return count;
  });
}
