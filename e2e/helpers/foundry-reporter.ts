import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { chromium } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';

function startReportServer(reportDir: string, port = 9323): Promise<string> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawUrl = req.url || '/';
      const safePath = path.normalize(rawUrl).replace(/^(\.\.[\/\\])+/, '');
      let filePath = path.join(
        reportDir,
        safePath === '/' ? 'index.html' : safePath
      );
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(reportDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.zip': 'application/zip',
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });

    server.listen(port, () => {
      resolve(`http://localhost:${port}`);
    });

    server.on('error', () => {
      resolve(`http://localhost:${port}`);
    });
  });
}

/**
 * Custom Playwright reporter that posts a test run summary to Foundry VTT chat.
 */
export default class FoundryReporter implements Reporter {
  private total = 0;
  private passed = 0;
  private failed = 0;
  private skipped = 0;
  private startTime = 0;
  private configDir = '';

  onBegin(config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length;
    this.startTime = Date.now();
    this.configDir = config.configFile
      ? path.dirname(config.configFile)
      : process.cwd();
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    if (result.status === 'passed') {
      this.passed++;
    } else if (result.status === 'skipped') {
      this.skipped++;
    } else {
      this.failed++;
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    const durationSec = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const rootDir = this.configDir || process.cwd();
    const reportDir = path.resolve(rootDir, 'playwright-report');
    const reportUrl = await startReportServer(reportDir);

    const summaryHtml =
      `<div class="chat-message"><header class="message-header">` +
      `<h4 class="message-sender">Playwright Test Runner</h4></header>` +
      `<div class="message-content">` +
      `<h3 style="margin:0 0 8px 0;">📊 Test Run Complete</h3>` +
      `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">` +
      `<tr><td><strong>Total:</strong> ${this.total}</td>` +
      `<td><span style="color:#2e7d32"><strong>Passed:</strong> ${this.passed}</span></td></tr>` +
      `<tr><td><span style="color:#c62828"><strong>Failed:</strong> ${this.failed}</span></td>` +
      `<td><span style="color:#ed6c02"><strong>Skipped:</strong> ${this.skipped}</span></td></tr>` +
      `</table>` +
      `<div><strong>Duration:</strong> ${durationSec}s</div>` +
      `<div style="margin-top:8px;">` +
      `<a href="${reportUrl}" target="_blank" style="color:#1976d2;">` +
      `📁 Open HTML Test Report</a></div>` +
      `</div></div>`;

    await this.sendSummaryMessage(summaryHtml);
  }

  private async sendSummaryMessage(content: string): Promise<void> {
    try {
      const baseURL = process.env.FOUNDRY_URL || 'http://localhost:30000';
      const browser = await chromium.launch();
      const context = await browser.newContext({
        baseURL,
        storageState: 'playwright/.auth/user.json',
      });
      const page = await context.newPage();
      await page.goto('/game');
      await page.waitForFunction(() => {
        interface FoundryGame {
          ready?: boolean;
        }
        return Boolean(
          (window as unknown as { game?: FoundryGame }).game?.ready
        );
      });

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

      await context.close();
      await browser.close();
    } catch (err) {
      console.error('Failed to post summary message to Foundry chat:', err);
    }
  }
}

