import { test as base, Page, BrowserContext } from '@playwright/test';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendChatMessage(page: Page, content: string): Promise<void> {
  try {
    await page.evaluate(async (msgContent) => {
      interface ChatMessageDoc {
        create(data: { content: string }): Promise<unknown>;
      }
      interface FoundryGame {
        ready?: boolean;
      }
      const globalObj = window as unknown as {
        game?: FoundryGame;
        ChatMessage?: ChatMessageDoc;
      };
      if (globalObj.game?.ready && globalObj.ChatMessage) {
        await globalObj.ChatMessage.create({ content: msgContent });
      }
    }, content);
  } catch (_err) {
    // Ignore errors if chat cannot be sent during page transition
  }
}

type SharedPageFixtures = {
  testProgressLogger: void;
};

type SharedWorkerFixtures = {
  sharedContext: BrowserContext;
  sharedPage: Page;
};

export const test = base.extend<SharedPageFixtures, SharedWorkerFixtures>({
  testProgressLogger: [
    async ({ sharedPage }, use, testInfo) => {
      const testTitle = testInfo.title;
      const startHtml =
        `<div class="chat-message"><header class="message-header">` +
        `<h4 class="message-sender">Playwright Test Runner</h4>` +
        `</header><div class="message-content">🧪 <strong>Running test:</strong> ` +
        `${escapeHtml(testTitle)}</div></div>`;

      await sendChatMessage(sharedPage, startHtml);

      await use();

      const status = testInfo.status;
      const isPassed = status === 'passed';
      const icon = isPassed ? '✅' : '❌';
      const statusText = isPassed ? 'Passed' : 'Failed';
      const badgeColor = isPassed ? '#2e7d32' : '#c62828';
      const uppercaseStatus = status ? status.toUpperCase() : 'UNKNOWN';

      const endHtml =
        `<div class="chat-message"><header class="message-header">` +
        `<h4 class="message-sender">Playwright Test Runner</h4>` +
        `</header><div class="message-content">` +
        `<div>${icon} <strong>Test ${statusText}:</strong> ` +
        `${escapeHtml(testTitle)}</div>` +
        `<div style="font-size:0.85em;margin-top:4px;color:${badgeColor};">` +
        `Status: ${uppercaseStatus} (${testInfo.duration}ms)` +
        `</div></div></div>`;

      await sendChatMessage(sharedPage, endHtml);
    },
    { auto: true },
  ],

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

