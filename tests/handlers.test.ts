import { getTokensInRegion } from "../src/areatargeting.ts";
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  applyPanacheForActor,
  handleFinisherAttack,
  clearPanacheForActor,
  applyPanacheForParryOrBuckler,
  isPanacheGeneratingParryOrBuckler
} from '../src/effects/panache.ts';
import { resolveMirrorImageOnAttack } from '../src/spells/mirrorimage.ts';
import { applyUnstableEffectOnFailure } from '../src/effects/unstablecheck.ts';
import {
  addSustainEffectToCaster,
  associateRegionWithSustainedEffect,
  postSustainMessagesForActor,
  expireUnsustainedEffectsForActor
} from '../src/sustain.ts';

import {
  handleStartOfTurnTokenEnter,
  handleStartOfTurnTokenExit,
  deleteWithinEffectsForRegion
} from '../src/startofturnspells.ts';
import { ActorPF2e, ChatMessagePF2e, ItemPF2e, RegionDocumentPF2e, TokenPF2e } from 'foundry-pf2e';

// Mock chatbuttonhelper to avoid real chat message creation
vi.mock('../src/chatbuttonhelper.ts', () => ({
  createChatMessageWithButton: vi.fn().mockResolvedValue({})
}));

// Setup global CONFIG mock
const mockDamageRollToMessage = vi.fn().mockResolvedValue({});
class MockDamageRoll {
  constructor(public expr: string) {}
  toMessage = mockDamageRollToMessage;
}
(globalThis as unknown as { CONFIG: unknown }).CONFIG = {
  Dice: {
    rolls: [MockDamageRoll]
  }
};

// Mock game.packs
const mockGetDocument = vi.fn().mockResolvedValue({
  toObject: () => ({ name: 'Mock Effect', type: 'effect', system: { slug: 'effect-panache' } })
});
const mockPack = { getDocument: mockGetDocument };

describe('Baseline Hook Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up standard game globals
    (globalThis as unknown as { game: unknown }).game = {
      user: {
        isGM: true,
        id: 'gm-user-id',
      },
      users: [
        { isGM: true, id: 'gm-user-id' }
      ],
      packs: {
        get: vi.fn().mockReturnValue(mockPack),
      },
      actors: {
        get: vi.fn(),
      },
      version: '13.336',
    };

    // Set up standard ChatMessage global mock
    (globalThis as unknown as { ChatMessage: unknown }).ChatMessage = {
      create: vi.fn().mockResolvedValue({}),
      getSpeaker: vi.fn().mockReturnValue({}),
    };

    // Set up standard ui notifications mock
    (globalThis as unknown as { ui: unknown }).ui = {
      notifications: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      }
    };
  });

  describe('Panache Handlers', () => {
    it('applyPanacheForActor: should apply panache if outcome is success', async () => {
      const mockActor = {
        items: Object.assign([], { contents: [], find: vi.fn() }),
        createEmbeddedDocuments: vi.fn()
      } as unknown as ActorPF2e;

      const mockMessage = {
        actor: mockActor,
        flags: {
          pf2e: {
            context: {
              outcome: 'success'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      await applyPanacheForActor(mockMessage);
      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalled();
    });

    it('applyPanacheForActor: should apply failure panache if outcome is failure', async () => {
      const mockPanacheEffect = {
        id: 'effect-id',
        name: 'Effect: Panache (1 round)',
        type: 'effect',
        system: { slug: 'effect-panache' }
      };

      const mockActor = {
        items: Object.assign([], {
          contents: [],
          find: () => mockPanacheEffect
        }),
        createEmbeddedDocuments: vi.fn(),
        updateEmbeddedDocuments: vi.fn()
      } as unknown as ActorPF2e;

      const mockMessage = {
        actor: mockActor,
        flags: {
          pf2e: {
            context: {
              outcome: 'failure'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      await applyPanacheForActor(mockMessage);
      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalled();
      expect(mockActor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [
        expect.objectContaining({ _id: 'effect-id', name: 'Effect: Panache (1 round)' })
      ]);
    });

    it('handleFinisherAttack: should prompt removing panache on failure', async () => {
      const mockActor = {} as unknown as ActorPF2e;
      const mockMessage = {
        actor: mockActor,
        flags: {
          pf2e: {
            context: {
              outcome: 'failure'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      const { createChatMessageWithButton } = await import('../src/chatbuttonhelper.ts');
      await handleFinisherAttack(mockMessage);
      expect(createChatMessageWithButton).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'remove-panache', actor: mockActor })
      );
    });

    it('clearPanacheForActor: should clear panache when damage is rolled', async () => {
      const deleteMock = vi.fn();
      const mockItems = Object.assign([], {
        contents: [] as object[],
        has: (id: string) => id === 'panache-1'
      });
      const mockActor = { items: mockItems } as unknown as ActorPF2e;

      const mockPanache = {
        id: 'panache-1',
        type: 'effect',
        system: { slug: 'effect-panache' },
        actor: mockActor,
        delete: deleteMock
      };

      const itemsList = [mockPanache];
      mockItems.contents = itemsList;

      const mockMessage = {
        actor: mockActor,
        flags: {
          pf2e: {
            context: {}
          }
        }
      } as unknown as ChatMessagePF2e;

      await clearPanacheForActor(mockMessage);
      expect(deleteMock).toHaveBeenCalled();
    });

    it('isParryOrBuckleEligible: should return true if dueling-parry option + failure', () => {
      const mockTargetActor = {
        items: Object.assign([], { contents: [] })
      } as unknown as ActorPF2e;

      const mockMessage = {
        target: { actor: mockTargetActor },
        flags: {
          pf2e: {
            context: {
              type: 'attack-roll',
              options: ['target:effect:dueling-parry'],
              outcome: 'failure'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      expect(isPanacheGeneratingParryOrBuckler(mockMessage)).toBe(true);
    });

    it('isParryOrBuckleEligible: should return true if extravagant-parry option + failure', () => {
      const mockTargetActor = {
        items: Object.assign([], { contents: [] })
      } as unknown as ActorPF2e;

      const mockMessage = {
        target: { actor: mockTargetActor },
        flags: {
          pf2e: {
            context: {
              type: 'attack-roll',
              options: ['target:effect:extravagant-parry'],
              outcome: 'failure'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      expect(isPanacheGeneratingParryOrBuckler(mockMessage)).toBe(true);
    });

    it('applyPanacheForParryOrBuckler: should apply failure panache to target actor', async () => {
      const mockPanacheEffect = {
        id: 'effect-id',
        type: 'effect',
        system: { slug: 'effect-panache' }
      };

      const mockTargetActor = {
        items: Object.assign([mockPanacheEffect], {
          contents: [],
          find: () => mockPanacheEffect
        }),
        createEmbeddedDocuments: vi.fn(),
        updateEmbeddedDocuments: vi.fn()
      } as unknown as ActorPF2e;

      const mockMessage = {
        target: {
          actor: mockTargetActor
        },
        flags: {
          pf2e: {
            context: {
              outcome: 'failure'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      await applyPanacheForParryOrBuckler(mockMessage);
      expect(mockTargetActor.createEmbeddedDocuments).toHaveBeenCalled();
    });
  });

  describe('Mirror Image Handlers', () => {
    it('resolveMirrorImageOnAttack: should decrease image count on failure', async () => {
      const decreaseMock = vi.fn();
      const mockEffect = {
        slug: 'spell-effect-mirror-image',
        system: { badge: { value: 3 } },
        decrease: decreaseMock
      };
      const mockTargetActor = {
        itemTypes: {
          effect: [mockEffect]
        }
      } as unknown as ActorPF2e;

      const mockMessage = {
        target: {
          actor: mockTargetActor,
          token: { object: { actor: mockTargetActor, document: {} } }
        },
        flags: {
          pf2e: {
            context: {
              outcome: 'failure'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      await resolveMirrorImageOnAttack(mockMessage);
      expect(decreaseMock).toHaveBeenCalled();
      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('destroys a <strong>Mirror Image</strong>')
        })
      );
    });

    it('resolveMirrorImageOnAttack: should prompt image roll on success', async () => {
      const mockEffect = {
        slug: 'spell-effect-mirror-image',
        system: { badge: { value: 3 } }
      };
      const mockTargetActor = {
        itemTypes: {
          effect: [mockEffect]
        }
      } as unknown as ActorPF2e;

      const mockMessage = {
        target: {
          actor: mockTargetActor,
          token: { object: { actor: mockTargetActor, document: {} } }
        },
        flags: {
          pf2e: {
            context: {
              outcome: 'success'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      const { createChatMessageWithButton } = await import('../src/chatbuttonhelper.ts');
      await resolveMirrorImageOnAttack(mockMessage);
      expect(createChatMessageWithButton).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'roll-mirror-image', actor: mockTargetActor })
      );
    });
  });

  describe('Unstable Check Handlers', () => {
    it('applyUnstableEffectOnFailure: should apply unstable effect on failure', async () => {
      const mockActor = {
        createEmbeddedDocuments: vi.fn()
      } as unknown as ActorPF2e;

      vi.spyOn(game.actors, 'get').mockReturnValue(mockActor);

      const mockMessage = {
        flags: {
          pf2e: {
            context: {
              actor: 'actor-id'
            }
          }
        }
      } as unknown as ChatMessagePF2e;

      await applyUnstableEffectOnFailure(mockMessage);
      expect(game.actors.get).toHaveBeenCalledWith('actor-id');
      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalled();
    });
  });

  describe('Sustain Spell Handlers', () => {
    it('addSustainEffectToCaster: should add sustain effect if spell has sustained duration', async () => {
      const mockActor = {
        items: Object.assign([], { find: vi.fn().mockReturnValue(undefined) }),
        createEmbeddedDocuments: vi.fn().mockResolvedValue([ { name: 'Sustaining: Bless' } ])
      } as unknown as ActorPF2e;

      const mockSpell = {
        type: 'spell',
        name: 'Bless',
        img: 'bless.webp',
        system: {
          description: { value: 'Bless description' },
          duration: { sustained: true },
          level: { value: 1 }
        }
      } as unknown as ItemPF2e;

      const mockMessage = {
        item: mockSpell,
        actor: mockActor,
        flags: {
          pf2e: {}
        }
      } as unknown as ChatMessagePF2e;

      await addSustainEffectToCaster(mockMessage);
      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalledWith(
        'Item',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Sustaining: Bless',
            type: 'effect'
          })
        ])
      );
    });

    it('associateRegionWithSustainedEffect: should associate region with effect', async () => {
      const mockEffect = {
        type: 'effect',
        slug: 'sustaining-effect-bless',
        system: { slug: 'sustaining-effect-bless' },
        getFlag: vi.fn().mockReturnValue('spell-id'),
        update: vi.fn()
      };

      const mockActor = {
        items: Object.assign([mockEffect], {
          contents: [mockEffect],
          get: vi.fn().mockReturnValue({ slug: 'bless' }),
          filter: Array.prototype.filter
        })
      } as unknown as ActorPF2e;

      // A real region carries no `actor` or `item`; both are resolved from the PF2e origin flags.
      (globalThis as unknown as { fromUuidSync: unknown }).fromUuidSync = vi
        .fn()
        .mockReturnValue(mockActor);

      const mockRegion = {
        id: 'region-id',
        flags: {
          pf2e: {
            origin: { actor: 'Actor.abc123', slug: 'bless' }
          }
        },
        getFlag: vi.fn(),
        update: vi.fn()
      } as unknown as RegionDocumentPF2e;

      await associateRegionWithSustainedEffect(mockRegion);
      expect(mockEffect.update).toHaveBeenCalledWith({
        'flags.samioli-module.sustainedRegionId': 'region-id'
      });
    });

    it(
      'postSustainMessagesForActor: should reset flag and post chat message',
      async () => {
        const mockEffect = {
          type: 'effect',
          slug: 'sustaining-effect-bless',
          getFlag: vi.fn().mockImplementation((_module, flag) => {
            if (flag === "sustained") return true;
            if (flag === "sustainedSpellId") return "spell-id";
            return undefined;
          }),
          update: vi.fn()
        };

        const mockSpell = {
          type: 'spell',
          name: 'Bless',
          img: 'bless.webp',
          system: {
            description: { value: 'Bless description' },
            duration: { sustained: true },
            level: { value: 1 }
          }
        };

        const mockActor = {
          items: Object.assign([mockEffect], {
            filter: vi.fn().mockReturnValue([mockEffect]),
            get: vi.fn().mockReturnValue(mockSpell)
          })
        } as unknown as ActorPF2e;

        await postSustainMessagesForActor(mockActor);
        expect(mockEffect.update).toHaveBeenCalledWith({
          'flags.samioli-module.sustained': false
        });
      }
    );

    it('expireUnsustainedEffectsForActor: should delete unsustained effects', async () => {
      const mockItems = Object.assign([], {
        filter: vi.fn(),
        has: (id: string) => id === 'effect-1'
      });
      const mockActor = { items: mockItems } as unknown as ActorPF2e;

      const mockEffect = {
        id: 'effect-1',
        type: 'effect',
        slug: 'sustaining-effect-bless',
        actor: mockActor,
        getFlag: vi.fn().mockReturnValue(false),
        delete: vi.fn()
      };

      mockItems.filter.mockReturnValue([mockEffect]);

      await expireUnsustainedEffectsForActor(mockActor);
      expect(mockEffect.delete).toHaveBeenCalled();
    });
  });

  describe('Region Trigger Handlers', () => {
    it('runMatchingRegionFunctionAsCreator: should match via origin.rollOptions', async () => {
      const { runMatchingRegionFunctionAsCreator } = await import('../src/triggers.ts');
      const mockRegion = {
        flags: {
          pf2e: {
            origin: {
              rollOptions: ['origin:item:storm-spiral']
            }
          }
        }
      } as unknown as RegionDocumentPF2e;

      const matched = runMatchingRegionFunctionAsCreator(mockRegion);
      expect(matched).toBe(true);
    });

    it('runMatchingRegionFunctionAsCreator: should not match when no roll option corresponds', async () => {
      const { runMatchingRegionFunctionAsCreator } = await import('../src/triggers.ts');
      // A real item UUID ends in a random document ID, never a readable slug, so there is nothing
      // to fall back on when rollOptions is absent.
      const mockRegion = {
        flags: {
          pf2e: {
            origin: {
              uuid: 'Compendium.pf2e.spells-srd.Item.aB3xY9kLmN2pQr7s'
            }
          }
        }
      } as unknown as RegionDocumentPF2e;

      const matched = runMatchingRegionFunctionAsCreator(mockRegion);
      expect(matched).toBe(false);
    });

    it('runMatchingRegionFunctionAsGm: should match via origin.rollOptions for GM triggers', async () => {
      const { runMatchingRegionFunctionAsGm } = await import('../src/triggers.ts');
      // Matching dispatches the mapped function for real, so the mock needs enough of a region for
      // initiateFloatingFlame to bail cleanly on a missing caster and shape.
      const mockRegion = {
        id: 'region-gm-trigger',
        setFlag: vi.fn().mockResolvedValue({}),
        getFlag: vi.fn().mockReturnValue(undefined),
        shapes: [],
        flags: {
          pf2e: {
            origin: {
              rollOptions: ['origin:item:floating-flame']
            }
          }
        }
      } as unknown as RegionDocumentPF2e;

      const matched = runMatchingRegionFunctionAsGm(mockRegion);
      expect(matched).toBe(true);
    });
  });

  describe('getTokensInRegion region containment', () => {
    const scene = { id: 'scene-1' };

    /**
     * Builds a token whose containment answer is controlled by the test. `inside` stands in for
     * TokenDocument#testInsideRegion, which samples the whole footprint rather than a centre point.
     */
    const makeToken = (id: string, inside: boolean) => ({
      id,
      actor: { isOfType: (t: string) => t === 'creature', isDead: false },
      footprint: [{ i: 1, j: 1 }],
      document: {
        hidden: false,
        testInsideRegion: vi.fn().mockReturnValue(inside)
      }
    });

    /** `blocked` stands in for a wall between the region's origin and every token. */
    const setCanvas = (tokens: unknown[], blocked = false) => {
      (globalThis as unknown as { canvas: unknown }).canvas = {
        scene,
        tokens: { placeables: tokens },
        grid: {
          getCenterPoint: (o: { i: number; j: number }) => ({ x: o.j * 100 + 50, y: o.i * 100 + 50 })
        }
      };
      (globalThis as unknown as { CONFIG: unknown }).CONFIG = {
        Canvas: { polygonBackends: { move: { testCollision: () => blocked } } }
      };
    };

    const regionWithShape = (type = "circle", shapeCount = 1) => ({
      parent: scene,
      shapes: Array.from({ length: shapeCount }, () => ({
        type,
        origin: { x: 0, y: 0 },
        rotation: 0
      }))
    } as unknown as RegionDocumentPF2e);

    it('includes tokens the region contains and excludes those it does not', () => {
      const inside = makeToken('token-inside', true);
      const outside = makeToken('token-outside', false);
      setCanvas([inside, outside]);

      const tokens = getTokensInRegion(regionWithShape());
      expect(tokens).toHaveLength(1);
      expect(tokens[0].id).toBe('token-inside');
      expect(inside.document.testInsideRegion).toHaveBeenCalled();
    });

    it('returns nothing when the region belongs to a different scene', () => {
      const inside = makeToken('token-inside', true);
      setCanvas([inside]);

      const foreignRegion = {
        parent: { id: 'other-scene' },
        shapes: [{ origin: { x: 0, y: 0 }, rotation: 0 }]
      } as unknown as RegionDocumentPF2e;

      expect(getTokensInRegion(foreignRegion)).toEqual([]);
      expect(inside.document.testInsideRegion).not.toHaveBeenCalled();
    });

    it.each(['circle', 'line'])(
      'excludes a contained token behind a wall for a %s shape', (type) => {
        setCanvas([makeToken('behind-wall', true)], true);

        expect(getTokensInRegion(regionWithShape(type))).toEqual([]);
      });

    // The exempt cases matter most: "a ring region is never clipped" is the easiest thing to break.
    it.each([
      ['rectangle', 'a corner is not a point it radiates from'],
      ['ring', 'its centre is the hole, and not part of the area']
    ])('ignores walls for a %s shape, because %s', (type) => {
      setCanvas([makeToken('behind-wall', true)], true);

      expect(getTokensInRegion(regionWithShape(type))).toHaveLength(1);
    });

    it('ignores walls for a region built from several shapes', () => {
      setCanvas([makeToken('behind-wall', true)], true);

      expect(getTokensInRegion(regionWithShape("circle", 4))).toHaveLength(1);
    });

    it('ignores walls when the caller opts out, as persistent volumes do', () => {
      setCanvas([makeToken('behind-wall', true)], true);

      const tokens = getTokensInRegion(regionWithShape("circle"), { lineOfEffect: false });
      expect(tokens).toHaveLength(1);
    });

    it('samiOliModuleAPI: should export handleStartOfTurnTokenEnter', async () => {
      const { samiOliModuleAPI } = await import('../src/api.ts');
      expect(typeof samiOliModuleAPI.handleStartOfTurnTokenEnter).toBe('function');
    });

    it('handleStartOfTurnTokenEnter: should ignore subsequent calls if token already has effect for region', async () => {
      const mockEffect = {
        type: 'effect',
        flags: {
          'samioli-module': {
            startOfTurnRegionId: 'region-1'
          }
        }
      };

      const mockActor = {
        items: [mockEffect],
        createEmbeddedDocuments: vi.fn()
      };

      const mockToken = {
        id: 'token-1',
        actor: mockActor
      } as unknown as TokenPF2e;

      const mockRegion = {
        id: 'region-1',
        flags: {
          pf2e: {
            origin: {
              slug: 'ash-cloud'
            }
          }
        },
        getFlag: () => undefined
      } as unknown as RegionDocumentPF2e;

      await handleStartOfTurnTokenEnter(mockToken, mockRegion);

      // Bails on the existing-effect check, so nothing new is created.
      expect(mockActor.items).toHaveLength(1);
      expect(mockActor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('deleteWithinEffectsForRegion: should find and delete matching startOfTurnRegionId effects on scene tokens', async () => {
      const mockDelete = vi.fn().mockResolvedValue({});
      const mockEffect = {
        id: 'effect-1',
        type: 'effect',
        flags: {
          'samioli-module': {
            startOfTurnRegionId: 'region-1'
          }
        },
        delete: mockDelete
      };

      const mockActor = {
        items: Object.assign([mockEffect], {
          has: (id: string) => id === 'effect-1'
        })
      };
      (mockEffect as unknown as { actor: unknown }).actor = mockActor;

      (globalThis as unknown as { canvas: unknown }).canvas = {
        tokens: {
          placeables: [
            { actor: mockActor }
          ]
        }
      };

      const mockRegion = {
        id: 'region-1',
        getFlag: vi.fn().mockReturnValue(undefined)
      } as unknown as RegionDocumentPF2e;

      await deleteWithinEffectsForRegion(mockRegion);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('handleStartOfTurnTokenExit: should handle exit and deduplicate concurrent exit calls', async () => {
      const mockEffect = {
        id: 'effect-exit-1',
        type: 'effect',
        flags: {
          'samioli-module': {
            startOfTurnRegionId: 'region-exit-1'
          }
        },
        delete: vi.fn().mockResolvedValue({})
      };

      const mockActor = {
        items: Object.assign([mockEffect], {
          has: (id: string) => id === 'effect-exit-1'
        })
      };

      (globalThis as unknown as { canvas: unknown }).canvas = {
        scene: {
          regions: {
            has: (id: string) => id === 'region-exit-1'
          }
        }
      };

      const mockToken = {
        id: 'token-exit-1',
        actor: mockActor
      } as unknown as TokenPF2e;

      const mockRegion = {
        id: 'region-exit-1'
      } as unknown as RegionDocumentPF2e;

      // Run 2 concurrent exit calls
      await Promise.all([
        handleStartOfTurnTokenExit(mockToken, mockRegion),
        handleStartOfTurnTokenExit(mockToken, mockRegion)
      ]);

      expect(mockEffect.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Start of Turn behavior attachment', () => {
    const regionForSpell = (slug: string) => ({
      id: 'region-behaviors',
      flags: { pf2e: { origin: { slug } } },
      createEmbeddedDocuments: vi.fn().mockResolvedValue([])
    } as unknown as RegionDocumentPF2e);

    it('attaches tokenEnter and tokenExit behaviors after creation', async () => {
      const { attachStartOfTurnBehaviorsToRegion } = await import('../src/startofturnspells.ts');
      const region = regionForSpell('ash-cloud');

      await attachStartOfTurnBehaviorsToRegion(region);

      expect(region.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
      const [documentName, behaviors] = (
        region.createEmbeddedDocuments as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0];

      // Behaviors must be created as their own embedded documents: a Region carrying behaviors in
      // its creation payload is rejected outright for non-GM users.
      expect(documentName).toBe('RegionBehavior');
      expect(behaviors.map((b: { system: { events: string[] } }) => b.system.events[0]))
        .toEqual(['tokenEnter', 'tokenExit']);
    });

    it('guards every behavior script against running on non-GM clients', async () => {
      const { attachStartOfTurnBehaviorsToRegion } = await import('../src/startofturnspells.ts');
      const region = regionForSpell('frozen-fog');

      await attachStartOfTurnBehaviorsToRegion(region);

      const [, behaviors] = (
        region.createEmbeddedDocuments as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0];

      // Foundry dispatches region events to every connected client with no user filtering.
      for (const behavior of behaviors as { system: { source: string } }[]) {
        expect(behavior.system.source).toContain('if (!game.user.isActiveGM) return;');
      }
    });

    it('does nothing for a region that is not a start-of-turn spell', async () => {
      const { attachStartOfTurnBehaviorsToRegion } = await import('../src/startofturnspells.ts');
      const region = regionForSpell('fireball');

      await attachStartOfTurnBehaviorsToRegion(region);

      expect(region.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('writes the region flags before attaching behaviors', async () => {
      const { initialiseStartOfTurnRegion } = await import('../src/startofturnspells.ts');

      // createWithinEffectSource reads the region flags, and attaching the behaviors fires
      // tokenEnter for tokens already in the area, which builds an effect. Flags written after that
      // point leave a wand-cast spell without its stored source.
      const callOrder: string[] = [];
      const region = {
        id: 'region-ordering',
        flags: { pf2e: { origin: { slug: 'ash-cloud', uuid: 'Actor.a.Item.b' } } },
        parent: { id: 'scene-1' },
        createEmbeddedDocuments: vi.fn().mockImplementation(async () => {
          callOrder.push('attach-behaviors');
          return [];
        }),
        getFlag: vi.fn().mockReturnValue(undefined),
        setFlag: vi.fn().mockImplementation(async () => {
          callOrder.push('write-flags');
        })
      } as unknown as RegionDocumentPF2e;

      (globalThis as unknown as { fromUuidSync: unknown }).fromUuidSync = vi.fn().mockReturnValue({
        name: 'Ash Cloud',
        toObject: () => ({ _id: 'spell-1' }),
        actor: { uuid: 'Actor.a' }
      });
      (globalThis as unknown as { canvas: unknown }).canvas = {
        scene: { id: 'scene-other' },
        tokens: { placeables: [] }
      };

      await initialiseStartOfTurnRegion(region);

      expect(callOrder).toContain('write-flags');
      expect(callOrder).toContain('attach-behaviors');
      expect(callOrder.indexOf('write-flags'))
        .toBeLessThan(callOrder.indexOf('attach-behaviors'));
    });

    it('recovers a wand-cast spell from the stored region flag once the chat message is gone', async () => {
      const { handleStartOfTurnTokenEnter } = await import('../src/startofturnspells.ts');

      // A spell cast from an item activation is transient and its UUID does not resolve. The
      // source stored on the region outlives the originating chat message.
      const createdEffects: unknown[] = [];
      const mockActor = {
        items: Object.assign([], {
          find: () => undefined,
          get: () => undefined
        }),
        createEmbeddedDocuments: vi.fn().mockImplementation(async (_t: string, data: unknown[]) => {
          createdEffects.push(...data);
          return data;
        })
      };
      const token = { id: 'token-late', actor: mockActor } as unknown as TokenPF2e;

      const region = {
        id: 'region-wand',
        flags: { pf2e: { origin: { slug: 'ash-cloud', uuid: 'Item.doesNotResolve' } } },
        getFlag: (_scope: string, key: string) =>
          key === 'spellSource' ? { _id: 'spell-x', name: 'Ash Cloud' } : undefined
      } as unknown as RegionDocumentPF2e;

      (globalThis as unknown as { fromUuidSync: unknown }).fromUuidSync = vi
        .fn()
        .mockReturnValue(null);
      (globalThis as unknown as { game: Record<string, unknown> }).game = {
        ...(globalThis as unknown as { game: Record<string, unknown> }).game,
        // No chat message to fall back on.
        messages: { get: () => undefined }
      };
      (globalThis as unknown as { CONFIG: Record<string, unknown> }).CONFIG = {
        ...(globalThis as unknown as { CONFIG: Record<string, unknown> }).CONFIG,
        Item: {
          documentClass: class {
            id = 'spell-x';
            name = 'Ash Cloud';
            uuid = 'Item.spell-x';
            img = 'icons/svg/aura.svg';
            actor = null;
            system = { level: { value: 3 }, slug: 'ash-cloud', description: { value: '' } };
            constructor(public source: unknown) {}
          }
        }
      };

      await handleStartOfTurnTokenEnter(token, region);

      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalled();
      expect(createdEffects).toHaveLength(1);
    });
  });
});
