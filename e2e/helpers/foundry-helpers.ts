import { Page } from '@playwright/test';

/**
 * Options for placing an actor onto the current active scene canvas.
 */
export interface DropActorOptions {
  actorName: string;
  x?: number;
  y?: number;
}

/**
 * Options for moving a token on the scene canvas.
 */
export interface MoveTokenOptions {
  tokenNameOrId: string;
  x: number;
  y: number;
}

/**
 * Options for posting an actor's action or item card to the chat.
 */
export interface PostActionOptions {
  actorNameOrId: string;
  actionName: string;
}

/**
 * Options for clicking a button within a chat message card.
 */
export interface ClickChatButtonOptions {
  buttonSelector: string;
  messageId?: string;
}

/**
 * Places an actor from the sidebar onto the active scene canvas.
 */
export async function dropActorToScene(
  page: Page,
  options: DropActorOptions
): Promise<string> {
  const { actorName, x, y } = options;

  const tokenId = await page.evaluate(
    async ({ name, posX, posY }) => {
      interface TokenDoc {
        id: string;
        width?: number;
        height?: number;
        update(data: { x: number; y: number }): Promise<unknown>;
      }
      interface PlaceableToken {
        id: string;
        name: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
        actor?: { name: string };
        document: TokenDoc;
      }
      interface SceneDoc {
        initial?: { x: number; y: number };
        createEmbeddedDocuments(
          type: string,
          data: unknown[]
        ): Promise<TokenDoc[]>;
      }
      interface ActorDoc {
        name: string;
        prototypeToken?: { width?: number; height?: number };
        getTokenDocument(data: { x: number; y: number }): Promise<unknown>;
      }
      interface FoundryGame {
        actors?: {
          find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
        };
      }
      interface CanvasObj {
        scene?: SceneDoc;
        stage?: {
          pivot?: { x: number; y: number };
        };
        dimensions?: {
          center?: { x: number; y: number };
        };
        grid?: {
          size?: number;
          getTopLeftPoint?: (pt: { x: number; y: number }) => {
            x: number;
            y: number;
          };
        };
        tokens?: {
          placeables?: PlaceableToken[];
        };
      }

      const globalObj = window as unknown as {
        game?: FoundryGame;
        canvas?: CanvasObj;
      };

      const existingToken = globalObj.canvas?.tokens?.placeables?.find(
        (t) =>
          t.name.toLowerCase() === name.toLowerCase() ||
          t.actor?.name.toLowerCase() === name.toLowerCase()
      );

      const actor = globalObj.game?.actors?.find(
        (a) => a.name.toLowerCase() === name.toLowerCase()
      );
      if (!actor && !existingToken) {
        throw new Error(`Actor "${name}" not found in game.actors.`);
      }

      let tokenGridW = 1;
      let tokenGridH = 1;
      if (existingToken) {
        tokenGridW =
          existingToken.document.width ?? existingToken.width ?? 1;
        tokenGridH =
          existingToken.document.height ?? existingToken.height ?? 1;
      } else if (actor?.prototypeToken) {
        tokenGridW = actor.prototypeToken.width ?? 1;
        tokenGridH = actor.prototypeToken.height ?? 1;
      }

      const gridSize = globalObj.canvas?.grid?.size ?? 100;
      const placeables = globalObj.canvas?.tokens?.placeables || [];

      const tokenW = tokenGridW * gridSize;
      const tokenH = tokenGridH * gridSize;

      const viewCenter =
        (globalObj.canvas?.stage?.pivot
          ? {
              x: globalObj.canvas.stage.pivot.x,
              y: globalObj.canvas.stage.pivot.y,
            }
          : null) ??
        globalObj.canvas?.scene?.initial ??
        globalObj.canvas?.dimensions?.center ?? { x: 1000, y: 1000 };

      let targetX = posX ?? viewCenter.x - tokenW / 2;
      let targetY = posY ?? viewCenter.y - tokenH / 2;

      if (posX === undefined || posY === undefined) {
        if (globalObj.canvas?.grid?.getTopLeftPoint) {
          const snapped = globalObj.canvas.grid.getTopLeftPoint({
            x: targetX,
            y: targetY,
          });
          if (snapped) {
            targetX = snapped.x;
            targetY = snapped.y;
          }
        }
      }

      const isOccupied = (xPos: number, yPos: number) => {
        return placeables.some((t) => {
          if (existingToken && t.id === existingToken.id) {
            return false;
          }
          const tGridW = t.document?.width ?? t.width ?? 1;
          const tGridH = t.document?.height ?? t.height ?? 1;
          const tW = tGridW * gridSize;
          const tH = tGridH * gridSize;

          return (
            xPos < t.x + tW &&
            xPos + tokenW > t.x &&
            yPos < t.y + tH &&
            yPos + tokenH > t.y
          );
        });
      };

      while (isOccupied(targetX, targetY)) {
        targetX += gridSize;
      }

      if (existingToken) {
        if (posX !== undefined || posY !== undefined) {
          await existingToken.document.update({ x: targetX, y: targetY });
        }
        return existingToken.id;
      }

      if (!actor) {
        throw new Error(`Actor "${name}" not found in game.actors.`);
      }

      const scene = globalObj.canvas?.scene;
      if (!scene) {
        throw new Error('No active canvas scene available.');
      }

      const tokenData = await actor.getTokenDocument({
        x: targetX,
        y: targetY,
      });
      const [tokenDoc] = await scene.createEmbeddedDocuments('Token', [
        tokenData,
      ]);

      for (let i = 0; i < 20; i++) {
        const p = globalObj.canvas?.tokens?.placeables?.find(
          (t) => t.id === tokenDoc.id
        );
        if (p) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      return tokenDoc.id;
    },
    { name: actorName, posX: x, posY: y }
  );

  return tokenId;
}

/**
 * Updates coordinates of a token on the active scene canvas.
 */
export async function moveToken(
  page: Page,
  options: MoveTokenOptions
): Promise<void> {
  const { tokenNameOrId, x, y } = options;

  await page.evaluate(
    async ({ idOrName, posX, posY }) => {
      interface TokenDoc {
        update(data: { x: number; y: number }): Promise<unknown>;
      }
      interface PlaceableToken {
        id: string;
        name: string;
        actor?: { name: string };
        document: TokenDoc;
      }
      interface CanvasObj {
        tokens?: {
          placeables?: PlaceableToken[];
        };
      }

      const globalObj = window as unknown as { canvas?: CanvasObj };
      const tokens = globalObj.canvas?.tokens?.placeables || [];
      const token = tokens.find(
        (t) =>
          t.id === idOrName ||
          t.name.toLowerCase() === idOrName.toLowerCase() ||
          t.actor?.name.toLowerCase() === idOrName.toLowerCase()
      );

      if (!token) {
        throw new Error(`Token "${idOrName}" not found on active scene.`);
      }

      await token.document.update({ x: posX, y: posY });
    },
    { idOrName: tokenNameOrId, posX: x, posY: y }
  );
}

/**
 * Selects/controls a token on the active scene canvas.
 */
export async function selectToken(
  page: Page,
  tokenNameOrId: string
): Promise<void> {
  await page.evaluate(async (idOrName) => {
    interface PlaceableToken {
      id: string;
      name: string;
      actor?: { id: string; name: string };
      control(options?: { releaseOthers?: boolean }): void;
    }
    interface CanvasObj {
      tokens?: {
        placeables?: PlaceableToken[];
      };
    }
    interface FoundryGame {
      user?: {
        character?: unknown;
        update(data: { character: string }): Promise<unknown>;
      };
    }

    const globalObj = window as unknown as {
      canvas?: CanvasObj;
      game?: FoundryGame;
    };
    const tokens = globalObj.canvas?.tokens?.placeables || [];
    const token = tokens.find(
      (t) =>
        t.id === idOrName ||
        t.name.toLowerCase() === idOrName.toLowerCase() ||
        t.actor?.name.toLowerCase() === idOrName.toLowerCase()
    );

    if (!token) {
      throw new Error(`Token "${idOrName}" not found on active scene.`);
    }

    token.control({ releaseOthers: true });

    if (token.actor && globalObj.game?.user) {
      await globalObj.game.user.update({ character: token.actor.id });
    }
  }, tokenNameOrId);
}

/**
 * Targets a token for the active user.
 */
export async function targetToken(
  page: Page,
  tokenNameOrId: string,
  options: { releaseOthers?: boolean } = {}
): Promise<void> {
  const { releaseOthers = false } = options;

  await page.evaluate(
    ({ idOrName, release }) => {
      interface PlaceableToken {
        id: string;
        name: string;
        actor?: { name: string };
        setTarget(
          target?: boolean,
          options?: { releaseOthers?: boolean }
        ): void;
      }
      interface CanvasObj {
        tokens?: {
          placeables?: PlaceableToken[];
        };
      }

      const globalObj = window as unknown as { canvas?: CanvasObj };
      const tokens = globalObj.canvas?.tokens?.placeables || [];
      const token = tokens.find(
        (t) =>
          t.id === idOrName ||
          t.name.toLowerCase() === idOrName.toLowerCase() ||
          t.actor?.name.toLowerCase() === idOrName.toLowerCase()
      );

      if (!token) {
        throw new Error(`Token "${idOrName}" not found on active scene.`);
      }

      token.setTarget(true, { releaseOthers: release });
    },
    { idOrName: tokenNameOrId, release: releaseOthers }
  );
}

/**
 * Untargets a specific token or clears all targets for the active user.
 */
export async function untargetToken(
  page: Page,
  tokenNameOrId?: string
): Promise<void> {
  await page.evaluate((idOrName) => {
    interface PlaceableToken {
      id: string;
      name: string;
      actor?: { name: string };
      setTarget(
        target?: boolean,
        options?: { releaseOthers?: boolean }
      ): void;
    }
    interface CanvasObj {
      tokens?: {
        placeables?: PlaceableToken[];
      };
    }
    interface UserObj {
      targets?: Set<PlaceableToken>;
    }

    const globalObj = window as unknown as {
      canvas?: CanvasObj;
      game?: { user?: UserObj };
    };

    if (idOrName) {
      const tokens = globalObj.canvas?.tokens?.placeables || [];
      const token = tokens.find(
        (t) =>
          t.id === idOrName ||
          t.name.toLowerCase() === idOrName.toLowerCase() ||
          t.actor?.name.toLowerCase() === idOrName.toLowerCase()
      );
      if (token) {
        token.setTarget(false);
      }
    } else {
      const targets = Array.from(globalObj.game?.user?.targets || []);
      for (const t of targets) {
        t.setTarget(false);
      }
    }
  }, tokenNameOrId);
}

/**
 * Sends an actor's item or action card to the Foundry chat log.
 */
export async function postActorActionToChat(
  page: Page,
  options: PostActionOptions
): Promise<string | undefined> {
  const { actorNameOrId, actionName } = options;

  const messageId = await page.evaluate(
    async ({ idOrName, actName }) => {
      interface ItemDoc {
        name: string;
        slug?: string;
        toChat?(): Promise<unknown>;
        toMessage?(): Promise<unknown>;
      }
      interface ActorDoc {
        id: string;
        name: string;
        items?: ItemDoc[];
      }
      interface PlaceableToken {
        id: string;
        name: string;
        actor?: ActorDoc;
      }
      interface FoundryGame {
        actors?: {
          find: (predicate: (a: ActorDoc) => boolean) => ActorDoc | undefined;
        };
        messages?: {
          contents?: Array<{ id: string }>;
        };
      }
      interface CanvasObj {
        tokens?: {
          placeables?: PlaceableToken[];
        };
      }

      const globalObj = window as unknown as {
        game?: FoundryGame;
        canvas?: CanvasObj;
      };

      let actor = globalObj.game?.actors?.find(
        (a) =>
          a.id === idOrName || a.name.toLowerCase() === idOrName.toLowerCase()
      );

      if (!actor) {
        const token = globalObj.canvas?.tokens?.placeables?.find(
          (t) =>
            t.id === idOrName ||
            t.name.toLowerCase() === idOrName.toLowerCase()
        );
        actor = token?.actor;
      }

      if (!actor) {
        throw new Error(`Actor or Token "${idOrName}" not found.`);
      }

      const items = actor.items || [];
      const item = items.find(
        (i) =>
          i.name.toLowerCase() === actName.toLowerCase() ||
          i.slug?.toLowerCase() === actName.toLowerCase()
      );

      if (!item) {
        throw new Error(
          `Action/Item "${actName}" not found on actor "${actor.name}".`
        );
      }

      if (typeof item.toChat === 'function') {
        await item.toChat();
      } else if (typeof item.toMessage === 'function') {
        await item.toMessage();
      } else {
        throw new Error(`Item "${item.name}" cannot be posted to chat.`);
      }

      const messages = globalObj.game?.messages?.contents || [];
      return messages[messages.length - 1]?.id;
    },
    { idOrName: actorNameOrId, actName: actionName }
  );

  return messageId;
}

/**
 * Checks if a PF2e Check Modifiers dialog is open and clicks the "Roll" submit button.
 */
export async function confirmRollDialogIfPresent(
  page: Page,
  timeout = 4000
): Promise<boolean> {
  const submitted = await page.evaluate(async (maxWaitMs) => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const form = document.querySelector(
        'form.check-modifiers-content, .window-content form'
      ) as HTMLFormElement | null;

      if (form) {
        const btn = form.querySelector(
          'button[type="submit"]'
        ) as HTMLButtonElement | null;
        if (btn) {
          btn.click();
        } else if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        }
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }, timeout);

  return submitted;
}

/**
 * Clicks a button inside a Foundry chat message card, and automatically
 * submits the PF2e roll modifiers dialog if one appears.
 */
export async function clickChatMessageButton(
  page: Page,
  options: ClickChatButtonOptions
): Promise<void> {
  const { buttonSelector, messageId } = options;

  await page.evaluate(
    ({ selector, msgId }) => {
      const card = msgId
        ? document.querySelector(`.chat-message[data-message-id="${msgId}"]`)
        : document.querySelector('.chat-message:last-child');

      const btn =
        (card?.querySelector(selector) as HTMLElement | null) ||
        (document.querySelector(selector) as HTMLElement | null);

      if (btn) {
        btn.click();
      }
    },
    { selector: buttonSelector, msgId: messageId }
  );

  await page.waitForTimeout(500);

  await confirmRollDialogIfPresent(page);
}
