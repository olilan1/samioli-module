import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/foundry-fixture.js';
import testModules from '../fixtures/test-modules.json' with { type: 'json' };

test.describe('Module Verification', () => {
  test('should verify target module and dependencies are active', async ({
    foundryPage,
  }: {
    foundryPage: Page;
  }) => {
    const requiredModules = [
      testModules.targetModule,
      ...testModules.additionalModules,
    ];

    for (const moduleId of requiredModules) {
      await expect
        .poll(
          async () => {
            return foundryPage.evaluate((id: string) => {
              const win = window as unknown as {
                game?: {
                  modules?: Map<string, { active?: boolean }>;
                };
              };
              const mod = win.game?.modules?.get(id);
              return Boolean(mod && mod.active);
            }, moduleId);
          },
          {
            message: `Module "${moduleId}" was expected to be active`,
            timeout: 10000,
          }
        )
        .toBe(true);
    }
  });
});
