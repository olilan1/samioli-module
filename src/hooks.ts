import { registerSettings, getSetting, SETTINGS, SettingsKey } from "./settings.ts"
import { addMacroButtonIfSupported } from "./chatmacrobutton.ts";
import { startTumbleThrough } from "./actions/tumblethrough.ts";
import { startEnjoyTheShow } from "./actions/enjoytheshow.ts";
import { checkForBravado, checkForExtravagantParryOrElegantBuckler, checkForFinisherAttack, checkForFinisherDamage } from "./effects/panache.ts";
import { checkForHuntPreyGM, checkForHuntPreyPlayer } from "./actions/huntprey.ts";
import { targetTokensUnderTemplate, deleteTemplateTargets, setTemplateColorToBlack } from "./templatetarget.ts";
import { checkForUnstableCheck } from "./effects/unstablecheck.ts";
import { ChatMessagePF2e, CombatantPF2e, EffectPF2e, EncounterPF2e, MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { runMatchingTemplateFunction } from "./triggers.ts";
import { ifActorHasSustainEffectCreateMessage, checkIfSpellInChatIsSustain, checkIfTemplatePlacedHasSustainEffect, deleteTemplateLinkedToSustainedEffect, createSpellNotSustainedChatMessage, checkIfChatMessageIsSustainButton } from "./sustain.ts";

Hooks.on("init", () => {
    registerSettings();
});

Hooks.on('renderChatMessage', async (message: ChatMessagePF2e, html: JQuery<HTMLElement>) => {
    addMacroButtonIfSupported(message, html);
    checkIfChatMessageIsSustainButton(message, html);
});

Hooks.on("createMeasuredTemplate", async (template: MeasuredTemplateDocumentPF2e, _context, userId) => {
    // Check for matching origin and run matching function if found (see triggers.ts)
    if (!runMatchingTemplateFunction(template, userId)) {
        // If no matching origin, target tokens if that feature is enabled
        hook(targetTokensUnderTemplate, template, userId)
            .ifEnabled(SETTINGS.TEMPLATE_TARGET)
            .run();
    }
    hook(checkIfTemplatePlacedHasSustainEffect, template)
            .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
            .ifGM()
            .run();
});

Hooks.on("preCreateMeasuredTemplate", (template: MeasuredTemplateDocumentPF2e, _data, _context, _userId) => {
    hook(setTemplateColorToBlack, template)
            .ifEnabled(SETTINGS.TEMPLATE_COLOUR_OVERRIDE)
            .run();
});

Hooks.on("deleteMeasuredTemplate", (template: MeasuredTemplateDocumentPF2e) => {
    hook(deleteTemplateTargets, template)
            .ifEnabled(SETTINGS.TEMPLATE_TARGET)
            .run();
});

Hooks.on("createChatMessage", (message: ChatMessagePF2e, _rollmode, _userId) => {
    if (game.modules.get('dice-so-nice')?.active
            && message.isRoll 
            && message.rolls.some(roll => roll.dice.length > 0)) {
        // Includes a roll, message will be posted by DiceSoNice
        return;
    }
    handleChatMessagePostRoll(message);
});

Hooks.on('diceSoNiceRollComplete', (id: string) => {
    const message = game.messages.get(id);
    if (message) {
      handleChatMessagePostRoll(message);
    };
});

//pf2e.startTurn only runs for the GM
Hooks.on('pf2e.startTurn', (combatant: CombatantPF2e, encounter: EncounterPF2e, _id) => {
    if (!combatant.actor) {
        return;
    }
    hook(ifActorHasSustainEffectCreateMessage, combatant.actor)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .run();
});

Hooks.on('preDeleteItem', async (effect: EffectPF2e, _action, _id) => {
    hook(createSpellNotSustainedChatMessage, effect)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .run();
    hook(deleteTemplateLinkedToSustainedEffect, effect)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .run();
});

function handleChatMessagePostRoll(message: ChatMessagePF2e) {
    switch (getMessageType(message)) {
        case "attack-roll":
            hook(checkForExtravagantParryOrElegantBuckler, message)
                    .ifEnabled(SETTINGS.AUTO_PANACHE)
                    .ifGM()
                    .run();
            hook(checkForFinisherAttack, message)
                    .ifEnabled(SETTINGS.AUTO_PANACHE)
                    .ifGM()
                    .run();
            hook(checkForBravado, message)
                    .ifEnabled(SETTINGS.AUTO_PANACHE)
                    .ifGM()
                    .run();
            break;
        case "damage-roll":
            hook(checkForFinisherDamage, message)
                    .ifEnabled(SETTINGS.AUTO_PANACHE)
                    .ifGM()
                    .run();
            break;
        case "skill-check":
            hook(startTumbleThrough, message)
                    .ifMessagePoster()
                    .run();
            hook(startEnjoyTheShow, message)
                    .ifMessagePoster()
                    .run();
            hook(checkForBravado, message)
                    .ifEnabled(SETTINGS.AUTO_PANACHE)
                    .ifGM()
                    .run();
            break;
        case "flat-check":
            hook(checkForUnstableCheck, message)
                    .ifEnabled(SETTINGS.AUTO_UNSTABLE_CHECK)
                    .ifGM()
                    .run();
            break;
        case "action":
            hook(checkForHuntPreyGM, message)
                    .ifEnabled(SETTINGS.AUTO_HUNT_PREY)
                    .ifGM()
                    .run();
            hook(checkForHuntPreyPlayer, message)
                    .ifEnabled(SETTINGS.AUTO_HUNT_PREY)
                    .ifMessagePoster()
                    .run();
            break;
        case "spell": 
        case "spell-cast":
            hook(checkIfSpellInChatIsSustain, message)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .ifMessagePosterAndActorOwner()
                    .run();
            break;
    }
}

function getMessageType(message: ChatMessagePF2e) {
    return message.flags?.pf2e?.context?.type ?? message.flags?.pf2e?.origin?.type;
}

function hook<T extends unknown[]>(func: (...args: T) => void, ...args: T): HookRunner<T> {
    return new HookRunner<T>(func, ...args);
}

class HookRunner<T extends unknown[]> {
    func: (...args: T) => void;
    args: T;
    shouldRun: boolean;

    constructor(func: (...args: T) => void, ...args: T) {
        this.func = func;
        this.args = args;
        this.shouldRun = true;
    }

    ifEnabled(...settings: SettingsKey[]): this {
        for (const setting of settings) {
            if (!getSetting(setting)) {
                this.shouldRun = false;
            }
        }
        return this;
    }

    ifGM(): this {
        if (!game.user.isGM) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessagePoster(): this {
        const message = this.args[0] as ChatMessagePF2e;
        if (game.user.id != message.author?.id) {
            this.shouldRun = false;
        }
        return this;
    }

    ifMessagePosterAndActorOwner(): this {
        const message = this.args[0] as ChatMessagePF2e;
        if (game.user.id != message.author?.id || !message.actor?.isOwner) {
            this.shouldRun = false;
        }
        return this;
    }

    run(): void {
        if (this.shouldRun) {
            this.func(...this.args);
        }
    }
}