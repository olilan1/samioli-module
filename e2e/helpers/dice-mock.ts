import { Page } from '@playwright/test';

/**
 * Executes an async action while forcing any d20 rolls in Foundry VTT
 * to return a specific outcome (1 to 20).
 */
export async function withForcedD20<T>(
  page: Page,
  d20Value: number,
  action: () => Promise<T>
): Promise<T> {
  await setForcedD20(page, d20Value);
  try {
    return await action();
  } finally {
    await clearForcedD20(page);
  }
}

/**
 * Sets a persistent d20 forced result on the page until manually cleared using `clearForcedD20`.
 */
export async function setForcedD20(
  page: Page,
  d20Value: number
): Promise<void> {
  await page.evaluate((val) => {
    interface DieInstance {
      faces?: number;
      results?: Array<{ result?: number; active?: boolean }>;
      total?: number;
    }

    interface DieProto extends DieInstance {
      evaluate: (options?: unknown) => unknown;
      _realOrigEvaluate?: (options?: unknown) => unknown;
    }

    const win = window as unknown as {
      CONFIG?: {
        Dice?: { terms?: { d?: { prototype: DieProto } } };
        randomUniform?: () => number;
      };
      foundry?: {
        dice?: { terms?: { Die?: { prototype: DieProto } } };
      };
      Die?: { prototype: DieProto };
      _origRandomUniform?: () => number;
    };

    if (win.CONFIG?.randomUniform && !win._origRandomUniform) {
      win._origRandomUniform = win.CONFIG.randomUniform;
    }
    if (win.CONFIG) {
      win.CONFIG.randomUniform = () => (val - 0.5) / 20;
    }

    const rawProtos = [
      win.CONFIG?.Dice?.terms?.d?.prototype,
      win.foundry?.dice?.terms?.Die?.prototype,
      win.Die?.prototype,
    ].filter((p): p is DieProto => Boolean(p?.evaluate));

    const uniqueProtos = Array.from(new Set(rawProtos));

    for (const proto of uniqueProtos) {
      if (!proto._realOrigEvaluate) {
        proto._realOrigEvaluate = proto.evaluate;
      }
      const realOrig = proto._realOrigEvaluate;

      proto.evaluate = function (options?: unknown) {
        const res = realOrig.call(this, options);
        const applyMock = (d: DieInstance) => {
          if (d.faces === 20 && Array.isArray(d.results)) {
            for (const r of d.results) {
              r.result = val;
            }
            d.total = val * d.results.length;
          }
        };

        if (res && typeof (res as Promise<unknown>).then === 'function') {
          return (res as Promise<unknown>).then((evaluated: unknown) => {
            applyMock(this);
            return evaluated;
          });
        }
        applyMock(this);
        return res;
      };
    }
  }, d20Value);
}

/**
 * Clears any active d20 forced roll override and restores Foundry's default random generator.
 */
export async function clearForcedD20(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface DieInstance {
      faces?: number;
      results?: Array<{ result?: number; active?: boolean }>;
      total?: number;
    }

    interface DieProto extends DieInstance {
      evaluate: (options?: unknown) => unknown;
      _realOrigEvaluate?: (options?: unknown) => unknown;
    }

    const win = window as unknown as {
      CONFIG?: {
        Dice?: { terms?: { d?: { prototype: DieProto } } };
        randomUniform?: () => number;
      };
      foundry?: {
        dice?: { terms?: { Die?: { prototype: DieProto } } };
      };
      Die?: { prototype: DieProto };
      _origRandomUniform?: () => number;
    };

    if (win.CONFIG && win._origRandomUniform) {
      win.CONFIG.randomUniform = win._origRandomUniform;
      delete win._origRandomUniform;
    }

    const rawProtos = [
      win.CONFIG?.Dice?.terms?.d?.prototype,
      win.foundry?.dice?.terms?.Die?.prototype,
      win.Die?.prototype,
    ].filter((p): p is DieProto => Boolean(p?.evaluate));

    const uniqueProtos = Array.from(new Set(rawProtos));

    for (const proto of uniqueProtos) {
      if (proto._realOrigEvaluate) {
        proto.evaluate = proto._realOrigEvaluate;
        delete proto._realOrigEvaluate;
      }
    }
  });
}
