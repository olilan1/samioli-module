import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hook } from '../src/hooks.ts';
import { SETTINGS } from '../src/settings.ts';
import { ChatMessagePF2e, GamePF2e } from 'foundry-pf2e';

// Mock getSetting
const mockSettings = new Map<string, boolean>();
vi.mock('../src/settings.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/settings.ts')>();
  return {
    ...original,
    getSetting: (key: string) => mockSettings.get(key) ?? false,
  };
});

describe('HookRunner & hook helper', () => {
  beforeEach(() => {
    mockSettings.clear();
    // Setup basic global game mock structure
    (globalThis as unknown as { game: GamePF2e }).game = {
      user: {
        isGM: false,
        id: 'current-user-id',
      },
      version: '13.336',
    } as unknown as GamePF2e;
  });

  it('should run callback with correct args if no conditions specified', () => {
    const callback = vi.fn();
    hook(callback, 'arg1', 2).run();
    expect(callback).toHaveBeenCalledWith('arg1', 2);
  });

  describe('ifEnabled', () => {
    it('should run callback if the settings are enabled', () => {
      mockSettings.set(SETTINGS.TEMPLATE_TARGET, true);
      const callback = vi.fn();

      hook(callback)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET)
        .run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if any setting is disabled', () => {
      mockSettings.set(SETTINGS.TEMPLATE_TARGET, true);
      mockSettings.set(SETTINGS.AUTO_PANACHE, false);
      const callback = vi.fn();

      hook(callback)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET, SETTINGS.AUTO_PANACHE)
        .run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifGM', () => {
    it('should run callback if user is GM', () => {
      (game.user as { isGM: boolean }).isGM = true;
      const callback = vi.fn();

      hook(callback).ifGM().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if user is not GM', () => {
      (game.user as { isGM: boolean }).isGM = false;
      const callback = vi.fn();

      hook(callback).ifGM().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifUser', () => {
    it('should run callback if current user ID matches target user ID', () => {
      const callback = vi.fn();

      hook(callback).ifUser('current-user-id').run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if user ID does not match', () => {
      const callback = vi.fn();

      hook(callback).ifUser('different-user-id').run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifMessagePoster', () => {
    it('should run callback if user matches message author', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'current-user-id' }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessagePoster().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if user does not match message author', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'different-user-id' }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessagePoster().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifMessagePosterAndActorOwner', () => {
    it('should run if user is message author AND owns the actor', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'current-user-id' },
        actor: { isOwner: true }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessagePosterAndActorOwner().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run if user is author but does not own the actor', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'current-user-id' },
        actor: { isOwner: false }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessagePosterAndActorOwner().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifV12', () => {
    it('should run if version starts with 12.', () => {
      (game as { version: string }).version = '12.328';
      const callback = vi.fn();

      hook(callback).ifV12().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run if version does not start with 12.', () => {
      (game as { version: string }).version = '13.336';
      const callback = vi.fn();

      hook(callback).ifV12().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Chaining conditions', () => {
    it('should run if all conditions in the chain are met', () => {
      mockSettings.set(SETTINGS.TEMPLATE_TARGET, true);
      (game.user as { isGM: boolean }).isGM = true;
      const callback = vi.fn();

      hook(callback)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET)
        .ifGM()
        .run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run if any condition in the chain fails', () => {
      mockSettings.set(SETTINGS.TEMPLATE_TARGET, true);
      (game.user as { isGM: boolean }).isGM = false;
      const callback = vi.fn();

      hook(callback)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET)
        .ifGM()
        .run();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
