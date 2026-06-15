import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hook } from '../src/hookrunner.ts';
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
      users: [
        { isGM: false, id: 'current-user-id' }
      ],
      version: '13.336',
    } as unknown as GamePF2e;
  });

  it('should throw if no semantic guards are configured and allowUnfilteredRun is not called', () => {
    const callback = vi.fn();
    expect(() => hook(callback).run()).toThrowError(/HookRunner: You must add guards/);
  });

  it('should run callback with correct args if allowUnfilteredRun is called', () => {
    const callback = vi.fn();
    hook(callback, 'arg1', 2).allowUnfilteredRun().run();
    expect(callback).toHaveBeenCalledWith('arg1', 2);
  });

  describe('ifEnabled', () => {
    it('should run callback if the settings are enabled', () => {
      mockSettings.set(SETTINGS.TEMPLATE_TARGET, true);
      const callback = vi.fn();

      hook(callback)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET)
        .allowUnfilteredRun()
        .run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if any setting is disabled', () => {
      mockSettings.set(SETTINGS.TEMPLATE_TARGET, true);
      mockSettings.set(SETTINGS.AUTO_PANACHE, false);
      const callback = vi.fn();

      hook(callback)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET, SETTINGS.AUTO_PANACHE)
        .allowUnfilteredRun()
        .run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifGM', () => {
    it('should run callback if user is GM', () => {
      (game.user as { isGM: boolean }).isGM = true;
      const callback = vi.fn();

      hook(callback).ifGM().allowUnfilteredRun().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if user is not GM', () => {
      (game.user as { isGM: boolean }).isGM = false;
      const callback = vi.fn();

      hook(callback).ifGM().allowUnfilteredRun().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifUser', () => {
    it('should run callback if current user ID matches target user ID', () => {
      const callback = vi.fn();

      hook(callback).ifUser('current-user-id').allowUnfilteredRun().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if user ID does not match', () => {
      const callback = vi.fn();

      hook(callback).ifUser('different-user-id').allowUnfilteredRun().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifMessagePoster', () => {
    it('should run callback if user matches message author', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'current-user-id' }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessagePoster().allowUnfilteredRun().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run callback if user does not match message author', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'different-user-id' }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessagePoster().allowUnfilteredRun().run();

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

      hook(callback, mockMessage)
        .ifMessagePosterAndActorOwner()
        .allowUnfilteredRun()
        .run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run if user is author but does not own the actor', () => {
      const callback = vi.fn();
      const mockMessage = {
        author: { id: 'current-user-id' },
        actor: { isOwner: false }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage)
        .ifMessagePosterAndActorOwner()
        .allowUnfilteredRun()
        .run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ifV12', () => {
    it('should run if version starts with 12.', () => {
      (game as { version: string }).version = '12.328';
      const callback = vi.fn();

      hook(callback).ifV12().allowUnfilteredRun().run();

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run if version does not start with 12.', () => {
      (game as { version: string }).version = '13.336';
      const callback = vi.fn();

      hook(callback).ifV12().allowUnfilteredRun().run();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Semantic guards (isGuarded = true)', () => {
    it('should satisfy isGuarded check with ifMessageOption', () => {
      const callback = vi.fn();
      const mockMessage = {
        flags: {
          pf2e: {
            context: {
              options: ['item:trait:bravado']
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessageOption('item:trait:bravado').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifNotMessageOption', () => {
      const callback = vi.fn();
      const mockMessage = {
        flags: {
          pf2e: {
            context: {
              options: ['some-other-option']
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifNotMessageOption('action:tumble-through').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifMessageOptionAny', () => {
      const callback = vi.fn();
      const mockMessage = {
        flags: {
          pf2e: {
            context: {
              options: ['origin:item:trait:unstable']
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage)
        .ifMessageOptionAny('origin:item:trait:unstable', 'self:action:trait:unstable')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifMessageItemSlug', () => {
      const callback = vi.fn();
      const mockMessage = {
        item: { slug: 'imaginary-weapon' }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessageItemSlug('imaginary-weapon').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifMessageHasTarget', () => {
      const callback = vi.fn();
      const mockMessage = {
        target: { actor: { id: 'target-id' } }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessageHasTarget().run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifTargetHasEffect', () => {
      const callback = vi.fn();
      const mockTargetActor = {
        itemTypes: {
          effect: [{ slug: 'spell-effect-mirror-image' }]
        }
      };
      const mockMessage = {
        target: { actor: mockTargetActor }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifTargetHasEffect('spell-effect-mirror-image').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifMessageOutcomeIn', () => {
      const callback = vi.fn();
      const mockMessage = {
        flags: {
          pf2e: {
            context: {
              outcome: 'success'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifMessageOutcomeIn('success', 'criticalSuccess').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifActorHasFeat', () => {
      const callback = vi.fn();
      const mockActor = {
        itemTypes: {
          feat: [{ slug: 'antagonize' }]
        }
      };
      const mockMessage = {
        actor: mockActor
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifActorHasFeat('antagonize').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifActorHasEffect', () => {
      const callback = vi.fn();
      const mockActor = {
        items: [{ type: 'effect', slug: 'samioli-antagonized' }]
      };
      const mockMessage = {
        actor: mockActor
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifActorHasEffect('samioli-antagonized').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifActorHasEffect when actor is passed directly', () => {
      const callback = vi.fn();
      const mockActor = {
        documentName: 'Actor',
        items: [{ type: 'effect', slug: 'samioli-antagonized' }]
      };

      hook(callback, mockActor).ifActorHasEffect('samioli-antagonized').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should NOT run if ifActorHasEffect slug does not match', () => {
      const callback = vi.fn();
      const mockActor = {
        items: [{ type: 'effect', slug: 'different-effect' }]
      };
      const mockMessage = {
        actor: mockActor
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifActorHasEffect('samioli-antagonized').run();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifActorHasEffectWithSlugPrefix', () => {
      const callback = vi.fn();
      const mockActor = {
        items: [{ type: 'effect', slug: 'sustaining-effect-wall-of-fire' }]
      };
      const mockMessage = {
        actor: mockActor
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage)
        .ifActorHasEffectWithSlugPrefix('sustaining-effect-')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifActorHasCondition', () => {
      const callback = vi.fn();
      const mockActor = {
        items: [{ type: 'condition', slug: 'frightened' }]
      };
      const mockMessage = {
        actor: mockActor
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage).ifActorHasCondition('frightened').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifActorHasEffectWithFlag', () => {
      const callback = vi.fn();
      const mockActor = {
        items: [{
          type: 'effect',
          slug: 'effect-slug',
          flags: {
            'samioli-module': {
              startOfTurnSpellUuid: 'uuid'
            }
          },
          getFlag(scope: string, key: string) {
            const self = this as { flags?: unknown };
            const flagsRecord = self.flags as Record<string, Record<string, unknown> | undefined>;
            return flagsRecord?.[scope]?.[key];
          }
        }]
      };
      const mockMessage = {
        actor: mockActor
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage)
        .ifActorHasEffectWithFlag('samioli-module', 'startOfTurnSpellUuid')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifItemType', () => {
      const callback = vi.fn();
      const mockItem = {
        documentName: 'Item',
        type: 'effect',
        slug: 'effect-slug',
        system: {},
      };

      hook(callback, mockItem).ifItemType('effect').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifItemType when item is nested', () => {
      const callback = vi.fn();
      const mockItem = {
        documentName: 'Item',
        type: 'effect',
        slug: 'effect-slug',
        system: {},
      };
      const mockMessage = {
        item: mockItem
      };

      hook(callback, mockMessage).ifItemType('effect').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifItemSlug', () => {
      const callback = vi.fn();
      const mockItem = {
        documentName: 'Item',
        type: 'effect',
        slug: 'effect-slug',
        system: {},
      };

      hook(callback, mockItem).ifItemSlug('effect-slug').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifItemSlugStartsWith', () => {
      const callback = vi.fn();
      const mockItem = {
        documentName: 'Item',
        type: 'effect',
        slug: 'sustaining-effect-wall-of-fire',
        system: {},
      };

      hook(callback, mockItem).ifItemSlugStartsWith('sustaining-effect-').run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifTokenHasFlag', () => {
      const callback = vi.fn();
      const mockToken = {
        documentName: 'Token',
        type: 'Token',
        getFlag: (scope: string, key: string) => {
          if (scope === 'samioli-module' && key === 'ghostlyCarrierEffectUUID') {
            return 'some-uuid';
          }
          return undefined;
        }
      };

      hook(callback, mockToken)
        .ifTokenHasFlag('samioli-module', 'ghostlyCarrierEffectUUID')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifTokenHasFlag when placeable token is passed', () => {
      const callback = vi.fn();
      const mockTokenDocument = {
        documentName: 'Token',
        getFlag: (scope: string, key: string) => {
          if (scope === 'samioli-module' && key === 'ghostlyCarrierEffectUUID') {
            return 'some-uuid';
          }
          return undefined;
        }
      };
      const mockPlaceableToken = {
        document: mockTokenDocument
      };

      hook(callback, mockPlaceableToken)
        .ifTokenHasFlag('samioli-module', 'ghostlyCarrierEffectUUID')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifTokenHasFlag when token is nested', () => {
      const callback = vi.fn();
      const mockTokenDocument = {
        documentName: 'Token',
        getFlag: (scope: string, key: string) => {
          if (scope === 'samioli-module' && key === 'ghostlyCarrierEffectUUID') {
            return 'some-uuid';
          }
          return undefined;
        }
      };
      const mockMessage = {
        token: mockTokenDocument
      };

      hook(callback, mockMessage)
        .ifTokenHasFlag('samioli-module', 'ghostlyCarrierEffectUUID')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with ifSceneHasTemplateWithFlag', () => {
      const callback = vi.fn();
      (globalThis as unknown as { canvas: unknown }).canvas = {
        templates: {
          placeables: [
            {
              document: {
                getFlag: (scope: string, key: string) => {
                  if (scope === 'samioli-module' && key === 'isStartOfTurnSpell') {
                    return true;
                  }
                  return undefined;
                }
              }
            }
          ]
        }
      };

      hook(callback)
        .ifSceneHasTemplateWithFlag('samioli-module', 'isStartOfTurnSpell')
        .run();
      expect(callback).toHaveBeenCalled();
      
      delete (globalThis as Record<string, unknown>).canvas;
    });

    it('should satisfy isGuarded check with ifMessageHasFlag', () => {
      const callback = vi.fn();
      const mockMessage = {
        flags: {
          'samioli-module': {
            buttonSlug: 'some-slug'
          }
        },
        getFlag(scope: string, key: string) {
          const self = this as { flags?: unknown };
          const flagsRecord = self.flags as
            | Record<string, Record<string, unknown> | undefined>
            | undefined;
          return flagsRecord?.[scope]?.[key];
        }
      } as unknown as ChatMessagePF2e;

      hook(callback, mockMessage)
        .ifMessageHasFlag('samioli-module', 'buttonSlug')
        .run();
      expect(callback).toHaveBeenCalled();
    });

    it('should satisfy isGuarded check with if predicate', () => {
      const callback = vi.fn();
      hook(callback).if(() => true).run();
      expect(callback).toHaveBeenCalled();
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
        .allowUnfilteredRun()
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
        .allowUnfilteredRun()
        .run();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
