import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e";
import { getOwnersFromActor, logd, MODULE_ID } from "./utils.ts";
import { onRemoveFrightenedAndAntagonizeClick } from "./effects/frightened.ts";
import { onRemoveAntagonizeClick } from "./actions/antagonize.ts";
import { onRemovePanacheClick } from "./effects/panache.ts";
import { onSustainSpellClick, onRemoveSummonClick } from "./sustain.ts";
import { onExtendBoostEidolonClick } from "./spells/boosteidolon.ts";
import { onTriggerSnareClick } from "./actions/snare.ts";
import { onRollMirrorImageClick } from "./spells/mirrorimage.ts";

export type ButtonHandler = (
    message: ChatMessagePF2e,
    ...params: string[]
) => void | Promise<void>;

const BUTTON_FUNCTION_MAPPINGS: Record<string, ButtonHandler> = {
    "remove-frightened-and-antagonize": onRemoveFrightenedAndAntagonizeClick,
    "remove-antagonize": onRemoveAntagonizeClick,
    "remove-panache": onRemovePanacheClick,
    "sustain-spell": onSustainSpellClick,
    "remove-summon": onRemoveSummonClick,
    "extend-boost-eidolon": onExtendBoostEidolonClick,
    "trigger-snare": onTriggerSnareClick,
    "roll-mirror-image": onRollMirrorImageClick
};

type MessageSpec = {
    slug: string;
    actor: ActorPF2e;
    content: string;
    button_label: string;
    flags?: Record<string, unknown>;
    params?: string[];
    gmOnly?: boolean;
};

/**
 * Creates a chat message containing a clickable button.
 * The slug must match a registered handler in BUTTON_FUNCTION_MAPPINGS.
 * Handlers must take (message: ChatMessagePF2e, ...params: string[]).
 * 
 * @example
 * createChatMessageWithButton({
 *     slug: "remove-antagonize",
 *     actor,
 *     content: "Message text",
 *     button_label: "Remove",
 *     params: [tokenId, effectId]
 * });
 */
export async function createChatMessageWithButton(spec: MessageSpec) {
    const handler = BUTTON_FUNCTION_MAPPINGS[spec.slug];
    if (!handler) {
        throw new Error(`[samioli-module] Button slug ${spec.slug} has no function mapping.`);
    }

    const expectedParamCount = Math.max(0, handler.length - 1);
    const actualParamCount = spec.params?.length ?? 0;
    if (actualParamCount !== expectedParamCount) {
        throw new Error(
            `[samioli-module] Slug "${spec.slug}" expects ${expectedParamCount} ` +
            `parameters, but received ${actualParamCount}.`
        );
    }

    const gms = game.users.filter(user => user.isGM).map(user => user.id);

    await ChatMessage.create({
        content: buildMessageContent(spec),
        whisper: spec.gmOnly ? gms : getOwnersFromActor(spec.actor).map(user => user.id),
        speaker: ChatMessage.getSpeaker({ actor: spec.actor }),
        flags: {
            [MODULE_ID]: {
                buttonSlug: spec.slug,
                ...spec.flags
            }
        }
    });
}

export function addButtonClickHandlers(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const slug = message.flags[MODULE_ID]?.buttonSlug as string | undefined;
    if (!slug) return;
    const handler = BUTTON_FUNCTION_MAPPINGS[slug];
    if (!handler) {
        logd(`Button slug ${slug} has no function mapping.`);
        return;
    }
 
    const button = html.find(`button[id="${slug}"]`);
    if (button.length > 0) {
        button.on('click', () => {
            const paramsAttr = button.attr("data-params") ?? "[]";
            const params = JSON.parse(paramsAttr) as string[];
            handler(message, ...params);
        });
    }
}

function buildMessageContent(spec: MessageSpec) {
    let result = spec.content +
        `<div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
        <button type="button" id="${spec.slug}"`;

    if (spec.params && spec.params.length > 0) {
        const escapedParams = JSON.stringify(spec.params).replace(/"/g, "&quot;");
        result += ` data-params="${escapedParams}"`;
    }
        
    result += `>${spec.button_label}</button></div>`;
    return result;
}