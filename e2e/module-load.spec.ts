import { test, expect } from './helpers/shared-test.js';

test.describe.configure({ mode: 'serial' });

test.describe('SamiOli Module Initialization', () => {
  test('should load module into active Foundry world', async ({ sharedPage }) => {
    await expect(sharedPage.locator('#interface')).toBeVisible({ timeout: 30000 });

    const isModuleActive = await sharedPage.evaluate(() => {
      const gameObj = (
        window as unknown as {
          game?: {
            modules?: {
              get?: (id: string) => { active?: boolean } | undefined;
            };
          };
        }
      ).game;
      return gameObj?.modules?.get?.('samioli-module')?.active ?? false;
    });

    expect(isModuleActive).toBe(true);
  });

  test('should confirm Foundry game canvas state is ready', async ({ sharedPage }) => {
    const isReady = await sharedPage.evaluate(() => {
      return Boolean(
        (window as unknown as { game?: { ready?: boolean } }).game?.ready
      );
    });

    expect(isReady).toBe(true);
  });
});
