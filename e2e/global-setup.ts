import { chromium, FullConfig } from '@playwright/test';
import { loginToFoundry } from './helpers/foundry-auth.js';

const authFile = 'playwright/.auth/user.json';

async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:30000';
  const browser = await chromium.launch();
  const page = await browser.newPage({
    baseURL,
    viewport: { width: 1920, height: 1080 },
  });

  try {
    await loginToFoundry(page, {
      username: 'Playwright',
      password: 'donotuse',
    });

    await page.evaluate(async () => {
      interface FoundryScene {
        id: string;
        name: string;
        active: boolean;
        activate: () => Promise<unknown>;
      }

      interface FoundryGame {
        ready?: boolean;
        scenes?: {
          find: (predicate: (s: FoundryScene) => boolean) => FoundryScene | undefined;
        };
        paused?: boolean;
        togglePause?: (pause: boolean, push: boolean) => Promise<unknown>;
      }

      const gameObj = (window as unknown as { game?: FoundryGame }).game;

      if (!gameObj?.ready) {
        throw new Error('Foundry VTT is not in ready state.');
      }

      const sceneName = 'TestScene';
      const scene = gameObj.scenes?.find((s) => s.name === sceneName);

      if (!scene) {
        throw new Error(`Scene "${sceneName}" was not found in active world.`);
      }

      if (!scene.active) {
        await scene.activate();
      }

      if (gameObj.paused && typeof gameObj.togglePause === 'function') {
        await gameObj.togglePause(false, true);
      }
    });

    await page.context().storageState({ path: authFile });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
