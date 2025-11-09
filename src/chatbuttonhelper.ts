import { ActorPF2e, ChatMessagePF2e } from "foundry-pf2e"
import { getOwnersFromActor, logd } from "./utils.ts";
import { removeFrightenedAndAntagonize } from "./effects/frightened.ts";
import { removeAntagonizeEffect } from "./actions/antagonize.ts";
import { onClearPanacheButtonClick } from "./effects/panache.ts";
import { handleSustainSpell } from "./sustain.ts";
import { extendBoostEidolon } from "./spells/boosteidolon.ts";

// Mapping of slug to function description.
// Slug must match what is provided in the MessageSpec when calling createChatMessageWithButton
// If takesMsg is true, the first parameter of the function must be a ChatMessagePF2e
const BUTTON_FUNCTION_MAPPINGS: Record<string, ButtonFunctionDescription> = {
    "remove-frightened-and-antagonize": { func: removeFrightenedAndAntagonize, takesMsg: false },
    "remove-antagonize": { func: removeAntagonizeEffect, takesMsg: false },
    "remove-panache": { func: onClearPanacheButtonClick, takesMsg: true },
    "sustain-spell": { func: handleSustainSpell, takesMsg: false },
    "extend-boost-eidolon": { func: extendBoostEidolon, takesMsg: true }
};

type StringOnlyFuncDescription = {
    func: (...args: string[]) => void;
    takesMsg: false;
};

type MessageFuncDescription = {
    func: (msg: ChatMessagePF2e, ...args: string[]) => void;
    takesMsg: true;
};

type ButtonFunctionDescription = StringOnlyFuncDescription | MessageFuncDescription;

type MessageSpec = {
    slug: string,
    actor: ActorPF2e,
    content: string,
    button_label: string,
    flags?: Record<string, unknown>,
    params?: string[]
}

export async function createChatMessageWithButton(spec: MessageSpec) {
    const funcDesc = BUTTON_FUNCTION_MAPPINGS[spec.slug];
    if (!funcDesc) {
        throw new Error(`Button slug ${spec.slug} has no function mapping.`);
    }
    const params = spec.params ?? [];
    const expectedParams = getNumberOfStringParams(funcDesc);
    if (params.length !== expectedParams) {
        throw new Error("Number of params provided does not match function inputs");
    }

    await ChatMessage.create({
        content: buildMessageContent(spec),
        whisper: getOwnersFromActor(spec.actor).map(user => user.id),
        speaker: ChatMessage.getSpeaker({ actor: spec.actor }),
        flags: {
            samioli: {
                buttonSlug: spec.slug,
                ...spec.flags
            }
        }
    });
}

export function addButtonClickHandlersIfNeeded(message: ChatMessagePF2e, html: JQuery<HTMLElement>) {
    const slug = message.flags.samioli?.buttonSlug as string | undefined;
    if (!slug) return;
    const funcDesc = BUTTON_FUNCTION_MAPPINGS[slug];
    if (!funcDesc) {
        logd(`Button slug ${slug} has no function mapping.`);
        return;
    }
 
    const button = html.find(`button[id="${slug}"]`);
    if (button.length > 0) {
        button.on('click', () => {
            const params: string[] = [];
            const numParams = getNumberOfStringParams(funcDesc);
            for (let i = 0; i < numParams; i++) {
                params.push(button.data(`param${i}`));
            }
            if (funcDesc.takesMsg) {
                funcDesc.func(message, ...params);
            } else {
                funcDesc.func(...params);
            }
        });
    }
}

function buildMessageContent(spec: MessageSpec) {
    let result = spec.content +
        `<div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
        <button type="button" id="${spec.slug}"`;

    if (spec.params) {
        for (let i = 0; i < spec.params.length; i++) {
            result += ` data-param${i}="${spec.params[i]}"`;
        }
    }
        
    result += `>${spec.button_label}</button></div>`;
    return result;
}

function getNumberOfStringParams(funcDesc: ButtonFunctionDescription) {
    return funcDesc.takesMsg ? funcDesc.func.length - 1 : funcDesc.func.length;
}