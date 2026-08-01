import { Page, expect } from '@playwright/test';

export interface LoginOptions {
  username?: string;
  password?: string;
  timeout?: number;
}

/**
 * Automates login to local Foundry VTT instance and waits for game ready state.
 */
export async function loginToFoundry(
  page: Page,
  options: LoginOptions = {}
): Promise<void> {
  const username = options.username || 'Playwright';
  const password = options.password || '';
  const timeout = options.timeout || 30000;

  await page.goto('/');

  const isAlreadyLoaded = await page.evaluate(() => {
    return Boolean(
      (window as unknown as { game?: { ready?: boolean } }).game?.ready
    );
  });

  if (isAlreadyLoaded) {
    return;
  }

  const userSelect = page.locator('select[name="userid"]');
  await userSelect.waitFor({ state: 'attached', timeout: 10000 });

  const availableOptions = await userSelect.evaluate(
    (select: HTMLSelectElement) =>
      Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.text.trim(),
        disabled: opt.disabled,
      }))
  );

  const matched = availableOptions.find((opt) => opt.text.includes(username));
  if (!matched) {
    const names = availableOptions.map((o) => `"${o.text}"`).join(', ');
    throw new Error(
      `User "${username}" not found. Available options: [${names}]`
    );
  }

  if (matched.disabled) {
    throw new Error(`User "${username}" is currently logged in and disabled.`);
  }

  await userSelect.selectOption(matched.value);
  await userSelect.dispatchEvent('change');

  if (password) {
    const passwordInput = page
      .locator('input[name="password"], input[name="key"]')
      .first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill(password);
  }

  await page.click('button[name="join"], button:has-text("Join Game Session")');

  const errorToast = page.locator('#notifications .notification.error');
  if (await errorToast.isVisible({ timeout: 2000 }).catch(() => false)) {
    const errorText = await errorToast.innerText();
    throw new Error(`Foundry VTT Login Rejected: ${errorText.trim()}`);
  }

  await page.waitForFunction(
    () => Boolean(
      (window as unknown as { game?: { ready?: boolean } }).game?.ready
    ),
    { timeout }
  );

  await page.evaluate(() => {
    interface SidebarObj {
      activateTab?: (name: string) => void;
      expand?: () => void;
    }
    interface FoundryGame {
      ready?: boolean;
    }
    const globalObj = window as unknown as {
      game?: FoundryGame;
      ui?: { sidebar?: SidebarObj };
    };

    if (globalObj.game?.ready && globalObj.ui?.sidebar) {
      globalObj.ui.sidebar.activateTab?.('chat');
      globalObj.ui.sidebar.expand?.();
    }
  });

  await expect(page.locator('#interface')).toBeVisible({ timeout });
}
