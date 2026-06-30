import { vi, describe, it, expect, beforeEach } from "vitest";
import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";
import {
    createChatMessageWithButton,
    addButtonClickHandlers
} from "../src/chatbuttonhelper.ts";
import { MODULE_ID } from "../src/utils.ts";
import { onRemoveAntagonizeClick } from "../src/actions/antagonize.ts";

vi.mock("../src/effects/frightened.ts", () => ({
    onRemoveFrightenedAndAntagonizeClick: vi.fn((_a, _b, _c, _d) => {})
}));
vi.mock("../src/actions/antagonize.ts", () => ({
    onRemoveAntagonizeClick: vi.fn((_a, _b, _c) => {})
}));
vi.mock("../src/effects/panache.ts", () => ({
    onRemovePanacheClick: vi.fn((_a) => {})
}));
vi.mock("../src/sustain.ts", () => ({
    onSustainSpellClick: vi.fn((_a, _b, _c) => {}),
    onRemoveSummonClick: vi.fn((_a, _b) => {})
}));
vi.mock("../src/spells/boosteidolon.ts", () => ({
    onExtendBoostEidolonClick: vi.fn((_a) => {})
}));
vi.mock("../src/actions/snare.ts", () => ({
    onTriggerSnareClick: vi.fn((_a, _b, _c, _d, _e, _f) => {})
}));
vi.mock("../src/spells/mirrorimage.ts", () => ({
    onRollMirrorImageClick: vi.fn((_a, _b, _c, _d) => {})
}));

describe("chatbuttonhelper", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock game global
        (globalThis as unknown as { game: unknown }).game = {
            users: [
                { isGM: true, id: "gm-user-id" },
                { isGM: false, id: "player-user-id" }
            ]
        };

        // Mock ChatMessage global
        (globalThis as unknown as { ChatMessage: unknown }).ChatMessage = {
            create: vi.fn().mockResolvedValue({}),
            getSpeaker: vi.fn().mockReturnValue({ actor: "speaker-actor-id" })
        };
    });

    describe("createChatMessageWithButton", () => {
        it("should create chat message when correct param count is passed", async () => {
            const mockActor = {
                id: "actor-id",
                testUserPermission: vi.fn().mockReturnValue(true)
            } as unknown as ActorPF2e;

            // "remove-antagonize" expects 2 parameters (tokenId, effectId)
            await createChatMessageWithButton({
                slug: "remove-antagonize",
                actor: mockActor,
                content: "Content",
                button_label: "Label",
                params: ["token-1", "effect-2"]
            });

            expect(ChatMessage.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining(
                        'data-params="[&quot;token-1&quot;,&quot;effect-2&quot;]"'
                    ),
                    flags: {
                        [MODULE_ID]: {
                            buttonSlug: "remove-antagonize"
                        }
                    }
                })
            );
        });

        it("should throw error for unregistered slug", async () => {
            const mockActor = {} as unknown as ActorPF2e;

            await expect(
                createChatMessageWithButton({
                    slug: "invalid-slug",
                    actor: mockActor,
                    content: "Content",
                    button_label: "Label"
                })
            ).rejects.toThrow(
                "[samioli-module] Button slug invalid-slug has no function mapping."
            );
        });

        it("should throw error for incorrect parameter count", async () => {
            const mockActor = {
                testUserPermission: vi.fn().mockReturnValue(true)
            } as unknown as ActorPF2e;

            // "remove-antagonize" expects 2 parameters
            await expect(
                createChatMessageWithButton({
                    slug: "remove-antagonize",
                    actor: mockActor,
                    content: "Content",
                    button_label: "Label",
                    params: ["only-one-param"]
                })
            ).rejects.toThrow(
                '[samioli-module] Slug "remove-antagonize" expects 2 parameters, but received 1.'
            );
        });

        it("should handle parameters containing single and double quotes safely", async () => {
            const mockActor = {
                id: "actor-id",
                testUserPermission: vi.fn().mockReturnValue(true)
            } as unknown as ActorPF2e;

            await createChatMessageWithButton({
                slug: "remove-antagonize",
                actor: mockActor,
                content: "Content",
                button_label: "Label",
                params: ["Sami's Eidolon", 'A "double" quote']
            });

            expect(ChatMessage.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining(
                        'data-params="[&quot;Sami\'s Eidolon&quot;,' +
                        '&quot;A \\&quot;double\\&quot; quote&quot;]"'
                    )
                })
            );
        });
    });

    describe("addButtonClickHandlers", () => {
        it("should bind click handler and trigger function on click", () => {
            const mockMessage = {
                flags: {
                    [MODULE_ID]: {
                        buttonSlug: "remove-antagonize"
                    }
                }
            } as unknown as ChatMessagePF2e;

            const mockButton = {
                length: 1,
                on: vi.fn(),
                attr: vi.fn().mockReturnValue(JSON.stringify(["token-1", "effect-2"]))
            };
            const mockHtml = {
                find: vi.fn().mockReturnValue(mockButton)
            } as unknown as JQuery<HTMLElement>;

            addButtonClickHandlers(mockMessage, mockHtml);

            expect(mockHtml.find).toHaveBeenCalledWith('button[id="remove-antagonize"]');
            expect(mockButton.on).toHaveBeenCalledWith("click", expect.any(Function));

            // Trigger the click callback
            const clickCallback = (mockButton.on as vi.Mock).mock.calls[0][1];
            clickCallback();

            expect(onRemoveAntagonizeClick).toHaveBeenCalledWith(
                mockMessage,
                "token-1",
                "effect-2"
            );
        });

        it("should do nothing if message has no buttonSlug flag", () => {
            const mockMessage = {
                flags: {}
            } as unknown as ChatMessagePF2e;

            const mockHtml = {
                find: vi.fn()
            } as unknown as JQuery<HTMLElement>;

            addButtonClickHandlers(mockMessage, mockHtml);

            expect(mockHtml.find).not.toHaveBeenCalled();
        });

        it("should parse parameters containing quotes back to original values", () => {
            const mockMessage = {
                flags: {
                    [MODULE_ID]: {
                        buttonSlug: "remove-antagonize"
                    }
                }
            } as unknown as ChatMessagePF2e;

            const mockButton = {
                length: 1,
                on: vi.fn(),
                attr: vi.fn().mockReturnValue(
                    '["Sami\'s Eidolon","A \\"double\\" quote"]'
                )
            };
            const mockHtml = {
                find: vi.fn().mockReturnValue(mockButton)
            } as unknown as JQuery<HTMLElement>;

            addButtonClickHandlers(mockMessage, mockHtml);

            const clickCallback = (mockButton.on as vi.Mock).mock.calls[0][1];
            clickCallback();

            expect(onRemoveAntagonizeClick).toHaveBeenCalledWith(
                mockMessage,
                "Sami's Eidolon",
                'A "double" quote'
            );
        });
    });
});
