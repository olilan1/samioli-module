import { test as base, Page } from '@playwright/test';
import { cleanupTestActors } from '../helpers/pf2eFactory.js';

export interface FoundryFixture {
  foundryPage: Page;
}

/**
 * Automatically accepts EULA terms if presented.
 */
async function handleEULA(page: Page): Promise<void> {
  const agreeCheck = page.locator('#eula-agree');
  const isEULAVisible = await agreeCheck
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (isEULAVisible) {
    await agreeCheck.check();
    const submitBtn = page.locator('button#sign[data-action="accept"]');
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    }
  }
}

/**
 * Handles admin authentication if prompt is present.
 */
async function handleAdminAuth(page: Page): Promise<void> {
  const adminInput = page.locator('input[name="adminPassword"]');
  const isAuthVisible = await adminInput.isVisible().catch(() => false);
  if (isAuthVisible) {
    const adminKey = process.env.FOUNDRY_ADMIN_KEY || 'admin';
    await adminInput.fill(adminKey);
    await page.click('button[name="action"][value="adminAuth"]');
  }
}

/**
 * Dismisses setup tutorial popups if presented.
 */
async function handleTutorialDialog(page: Page): Promise<void> {
  const tourButtons = page
    .locator(
      'aside button, [role="complementary"] button, [class*="tour"] button, [id*="tour"] button, i.fa-circle-xmark, button[data-action="close"], button[data-action="dismiss"]'
    )
    .or(page.getByRole('complementary').getByRole('button'));

  let count = 0;
  while (
    count < 5 &&
    (await tourButtons
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false))
  ) {
    await tourButtons.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    count++;
  }
}

/**
 * Handles launching base test world if setup screen is shown.
 */
async function handleWorldLaunch(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      try {
        const setup = (
          window as unknown as {
            game?: {
              setup?: { launchWorld?: (id: string) => Promise<unknown> };
            };
          }
        ).game?.setup;

        if (setup?.launchWorld) {
          await setup.launchWorld('playwright-test-world');
          return true;
        }

        const res = await fetch('/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'launchWorld',
            world: 'playwright-test-world',
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    })
    .catch(() => false);

  await page
    .waitForURL(
      (url) =>
        url.pathname.includes('/join') || url.pathname.includes('/game'),
      { timeout: 30000 }
    )
    .catch(() => {});
}

/**
 * Handles GM user selection and world login.
 */
async function handleGMLogin(page: Page): Promise<void> {
  const userSelect = page.locator('#join-game-form select[name="userid"]');
  const isUserVisible = await userSelect
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  if (isUserVisible) {
    await userSelect.selectOption({ label: 'Gamemaster' });
    const joinBtn = page.locator('#join-game-form button[name="join"]');
    await joinBtn.click();
    await page
      .waitForURL((url) => url.pathname.includes('/game'), {
        timeout: 30000,
      })
      .catch(() => {});
  }
}

/**
 * Ensures all installed modules are enabled in core settings.
 */
async function ensureAllModulesEnabled(page: Page): Promise<void> {
  const needsReload = await page.evaluate(async () => {
    const win = window as unknown as {
      game?: {
        settings?: {
          get(module: string, key: string): Record<string, boolean>;
          set(
            module: string,
            key: string,
            value: Record<string, boolean>
          ): Promise<unknown>;
        };
        modules?: Map<string, unknown>;
      };
    };
    const g = win.game;

    if (!g || !g.settings || !g.modules) return false;

    const config = g.settings.get('core', 'moduleConfiguration') || {};
    const installed = Array.from(g.modules.keys());
    let modified = false;

    const updated = { ...config };
    for (const modId of installed) {
      if (updated[modId] !== true) {
        updated[modId] = true;
        modified = true;
      }
    }

    if (modified) {
      await g.settings.set('core', 'moduleConfiguration', updated);
      return true;
    }

    return false;
  });

  if (needsReload) {
    await page.reload();
  }
}

/**
 * Extended Playwright test fixture for Foundry VTT v14 GM login and readiness.
 */
export const test = base.extend<FoundryFixture>({
  foundryPage: async ({ page }, use, testInfo) => {
    testInfo.setTimeout(180000);

    await page.addInitScript(() => {
      try {
        const tourProgress = {
          core: {
            setup: -1,
            backupsOverview: -1,
          },
        };
        window.localStorage.setItem(
          'core.tourProgress',
          JSON.stringify(tourProgress)
        );

        const tours = {
          'core.setup': { status: 'completed' },
          'core.backups': { status: 'completed' },
        };
        window.localStorage.setItem('core.tours', JSON.stringify(tours));
        window.localStorage.setItem('tours', JSON.stringify(tours));
      } catch {}
    });

    await page.goto('/');

    await handleEULA(page);

    const currentUrl = page.url();
    const isJoinSession =
      currentUrl.includes('/join') ||
      (await page
        .locator('#join-game-form')
        .isVisible()
        .catch(() => false));

    if (isJoinSession) {
      await handleGMLogin(page);
    } else {
      await handleAdminAuth(page);
      await handleTutorialDialog(page);
      await handleWorldLaunch(page);
      await handleGMLogin(page);
    }

    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { game?: { ready?: boolean } }).game?.ready
        ),
      undefined,
      { timeout: 120000 }
    );

    await ensureAllModulesEnabled(page);

    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { game?: { ready?: boolean } }).game?.ready
        ),
      undefined,
      { timeout: 120000 }
    );

    await use(page);

    await cleanupTestActors(page);
  },
});

export { expect } from '@playwright/test';
