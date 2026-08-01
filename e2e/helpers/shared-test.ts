import { test as base, Page, BrowserContext } from '@playwright/test';

type SharedPageFixtures = {};

type SharedWorkerFixtures = {
  sharedContext: BrowserContext;
  sharedPage: Page;
};

export const test = base.extend<SharedPageFixtures, SharedWorkerFixtures>({
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        storageState: 'playwright/.auth/user.json',
      });
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  sharedPage: [
    async ({ sharedContext }, use) => {
      let page = sharedContext.pages()[0];
      if (!page) {
        page = await sharedContext.newPage();
        await page.goto('/game');
        await page.waitForFunction(() => {
          return Boolean(
            (window as unknown as { game?: { ready?: boolean } }).game?.ready
          );
        });
      }
      await use(page);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
