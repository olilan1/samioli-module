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
  associateTemplateWithSustainedEffect
} from '../src/sustain.ts';
import { ActorPF2e, ChatMessagePF2e, ItemPF2e, MeasuredTemplateDocumentPF2e } from 'foundry-pf2e';

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
      const mockPanache = {
        type: 'effect',
        system: { slug: 'effect-panache' },
        delete: deleteMock
      };
      const itemsList = [mockPanache];
      const mockActor = {
        items: Object.assign(itemsList, { contents: itemsList })
      } as unknown as ActorPF2e;

      const mockMessage = {
        actor: mockActor,
        flags: {
          pf2e: {
            context: {}
          }
        }
      } as unknown as ChatMessagePF2e;

      clearPanacheForActor(mockMessage);
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
      } as unknown as MeasuredTemplateDocumentPF2e;

      await associateTemplateWithSustainedEffect(mockTemplate);
      expect(mockEffect.update).toHaveBeenCalledWith({
        'flags.samioli-module.sustainedTemplateId': 'template-id'
      });
    });
  });
});
