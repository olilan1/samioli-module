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
  associateTemplateWithSustainedEffect,
  postSustainMessagesForActor,
  expireUnsustainedEffectsForActor
} from '../src/sustain.ts';
import { getTemplateTokens } from '../src/templatetarget.ts';
import {
  handleStartOfTurnTokenEnter,
  handleStartOfTurnTokenExit,
  deleteWithinEffectsForTemplate
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
      const mockActor = {
        items: Object.assign([], {
          contents: [],
          has: (id: string) => id === 'panache-1'
        })
      } as unknown as ActorPF2e;

      const mockPanache = {
        id: 'panache-1',
        type: 'effect',
        system: { slug: 'effect-panache' },
        actor: mockActor,
        delete: deleteMock
      };

      const itemsList = [mockPanache];
      (mockActor.items as any).contents = itemsList;

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

    it('associateTemplateWithSustainedEffect: should associate template with effect', async () => {
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

      const mockTemplate = {
        id: 'template-id',
        actor: mockActor,
        item: { slug: 'bless' },
        update: vi.fn()
      } as unknown as RegionDocumentPF2e;

      await associateTemplateWithSustainedEffect(mockTemplate);
      expect(mockEffect.update).toHaveBeenCalledWith({
        'flags.samioli-module.sustainedRegionId': 'template-id'
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
      const mockActor = {
        items: Object.assign([], {
          filter: vi.fn(),
          has: (id: string) => id === 'effect-1'
        })
      } as unknown as ActorPF2e;

      const mockEffect = {
        id: 'effect-1',
        type: 'effect',
        slug: 'sustaining-effect-bless',
        actor: mockActor,
        getFlag: vi.fn().mockReturnValue(false),
        delete: vi.fn()
      };

      (mockActor.items as any).filter.mockReturnValue([mockEffect]);

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

    it('runMatchingRegionFunctionAsCreator: should match via origin.uuid fallback when rollOptions is missing', async () => {
      const { runMatchingRegionFunctionAsCreator } = await import('../src/triggers.ts');
      const mockRegion = {
        flags: {
          pf2e: {
            origin: {
              uuid: 'Compendium.pf2e.spells-srd.Item.StormSpiral'
            }
          }
        }
      } as unknown as RegionDocumentPF2e;

      const matched = runMatchingRegionFunctionAsCreator(mockRegion);
      expect(matched).toBe(true);
    });

    it('runMatchingRegionFunctionAsGm: should match via origin.uuid for GM triggers', async () => {
      const { runMatchingRegionFunctionAsGm } = await import('../src/triggers.ts');
      const mockRegion = {
        setFlag: vi.fn().mockResolvedValue({}),
        flags: {
          pf2e: {
            origin: {
              uuid: 'Compendium.pf2e.spells-srd.Item.FloatingFlame'
            }
          }
        }
      } as unknown as RegionDocumentPF2e;

      const matched = runMatchingRegionFunctionAsGm(mockRegion);
      expect(matched).toBe(true);
    });
  });

  describe('getTemplateTokens Region Fallback via RegionDocument#testPoint', () => {
    it('getTemplateTokens: should fallback to regionDocument.testPoint when region.tokens is empty on frame 0', async () => {
      const mockTokenInside = {
        id: 'token-inside',
        center: { x: 100, y: 100 },
        actor: {
          isOfType: (t: string) => t === 'creature',
          isDead: false
        },
        document: { hidden: false, elevation: 0 }
      };

      const mockTokenOutside = {
        id: 'token-outside',
        center: { x: 500, y: 500 },
        actor: {
          isOfType: (t: string) => t === 'creature',
          isDead: false
        },
        document: { hidden: false, elevation: 0 }
      };

      (globalThis as unknown as { canvas: unknown }).canvas = {
        tokens: {
          placeables: [mockTokenInside, mockTokenOutside]
        }
      };

      const mockRegion = {
        tokens: new Set(),
        testPoint: vi.fn().mockImplementation((point: { x: number; y: number }) => {
          return point.x === 100 && point.y === 100;
        })
      } as unknown as RegionDocumentPF2e;

      const tokens = await getTemplateTokens(mockRegion);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].id).toBe('token-inside');
      expect(mockRegion.testPoint).toHaveBeenCalled();
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
            startOfTurnTemplateId: 'region-1'
          }
        }
      };

      const mockActor = {
        items: [mockEffect]
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
        }
      } as unknown as RegionDocumentPF2e;

      await handleStartOfTurnTokenEnter(mockToken, mockRegion);
      // actor items remains length 1, no duplicate added
      expect(mockActor.items).toHaveLength(1);
    });

    it('deleteWithinEffectsForTemplate: should find and delete matching startOfTurnTemplateId effects on scene tokens', async () => {
      const mockDelete = vi.fn().mockResolvedValue({});
      const mockEffect = {
        id: 'effect-1',
        type: 'effect',
        flags: {
          'samioli-module': {
            startOfTurnTemplateId: 'region-1'
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

      await deleteWithinEffectsForTemplate(mockRegion);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('handleStartOfTurnTokenExit: should handle exit and deduplicate concurrent exit calls', async () => {
      const mockEffect = {
        id: 'effect-exit-1',
        type: 'effect',
        flags: {
          'samioli-module': {
            startOfTurnTemplateId: 'region-exit-1'
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
});
