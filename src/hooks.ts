import { registerSettings, getSetting, SETTINGS, SettingsKey } from "./settings.ts"
import { addAutoButtonIfNeeded } from "./chatautobuttons.ts";
import { startTumbleThrough } from "./actions/tumblethrough.ts";
import { editEnjoyTheShowSkillRollIfNeeded, startEnjoyTheShow } from "./actions/enjoytheshow.ts";
import { checkForBravado, checkForExtravagantParryOrElegantBuckler, checkForFinisherAttack, checkForFinisherDamage } from "./effects/panache.ts";
import { checkForHuntPreyGM, checkForHuntPreyPlayer } from "./actions/huntprey.ts";
import { targetTokensUnderTemplate, deleteTemplateTargets, setTemplateColorToBlack } from "./templatetarget.ts";
import { checkForUnstableCheck } from "./effects/unstablecheck.ts";
import { ChatMessagePF2e, CombatantPF2e, EncounterPF2e, ItemPF2e, MeasuredTemplateDocumentPF2e, TokenPF2e, UserPF2e } from "foundry-pf2e";
import { runMatchingTemplateDeletionFunction, runMatchingTemplateFunctionAsCreator, runMatchingTemplateFunctionAsGm } from "./triggers.ts";
import { ifActorHasSustainEffectCreateMessage, checkIfSpellInChatIsSustain, checkIfTemplatePlacedHasSustainEffect, deleteTemplateLinkedToSustainedEffect, createSpellNotSustainedChatMessage } from "./sustain.ts";
import { applyAntagonizeIfValid, createChatMessageOnTurnStartIfTokenIsAntagonized, warnIfDeletedItemIsFrightenedWhileAntagonized } from "./actions/antagonize.ts";
import { handleFrightenedAtTurnEnd } from "./effects/frightened.ts";
import { addButtonClickHandlersIfNeeded } from "./chatbuttonhelper.ts";
import { postMessagesForWithinEffects, deleteWithinEffectsForTemplate, addEffectsToTokensInStartOfTurnTemplates, addOrRemoveWithinEffectIfNeeded } from "./startofturnspells.ts";
import ChatLog from "foundry-pf2e/foundry/client/applications/sidebar/tabs/chat.mjs";
import { addDamageHelperButtonToChatUIv12, addDamageHelperButtonToChatUIv13 } from "./damagehelper.ts";
import { getHtmlElement, MODULE_ID } from "./utils.ts";
import { handleHomebrewUnstableCheckResult, replaceUnstableCheckWithStrainCheck } from "./unstablehomebrew.ts";
import { runBoostEidolonAutomation } from "./spells/boosteidolon.ts";
import { manifestEidolon } from "./actions/manifesteidolon.ts";
import { registerSocket } from "./sockets.ts";
import { oscillateEnergy } from "./conservationofenergy.ts";

Hooks.on("init", () => {
    registerSettings();
});

Hooks.once('socketlib.ready', () => {
    registerSocket();
});

Hooks.on('renderChatMessage', async (message: ChatMessagePF2e, html: JQuery<HTMLElement>) => {
    hook(addAutoButtonIfNeeded, message, html)
        .run();
    hook(editEnjoyTheShowSkillRollIfNeeded, message, html)
        .run();
    hook(addButtonClickHandlersIfNeeded, message, html)
        .run();
    hook(replaceUnstableCheckWithStrainCheck, message, html)
        .ifEnabled(SETTINGS.UNSTABLE_CHECK_HOMEBREW)
        .run();
});

Hooks.on("createMeasuredTemplate", async (template: MeasuredTemplateDocumentPF2e, _context, userId) => {
    // Check for matching origin and run matching function if found (see triggers.ts)
    let ranTemplateTrigger = hook(runMatchingTemplateFunctionAsGm, template).ifGM().run();
    ranTemplateTrigger ||= hook(runMatchingTemplateFunctionAsCreator, template).ifUser(userId).run();
            
    if (!ranTemplateTrigger) {
        // If no matching origin, target tokens if that feature is enabled
        hook(targetTokensUnderTemplate, template, userId)
            .ifEnabled(SETTINGS.TEMPLATE_TARGET)
            .run();
    }

    hook(checkIfTemplatePlacedHasSustainEffect, template)
            .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
            .ifGM()
            .run();

    hook(addEffectsToTokensInStartOfTurnTemplates, template)
            .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
            .ifGM()
            .run();
});

Hooks.on("preCreateMeasuredTemplate", (template: MeasuredTemplateDocumentPF2e, _data, _context, _userId) => {
    hook(setTemplateColorToBlack, template)
            .ifEnabled(SETTINGS.TEMPLATE_COLOUR_OVERRIDE)
            .run();
});

Hooks.on("deleteMeasuredTemplate", (template: MeasuredTemplateDocumentPF2e) => {
    hook(runMatchingTemplateDeletionFunction, template)
            .ifGM()
            .run();
    hook(deleteTemplateTargets, template)
            .ifEnabled(SETTINGS.TEMPLATE_TARGET)
            .run();
    hook(deleteWithinEffectsForTemplate, template)
            .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
            .ifGM()
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
Hooks.on('pf2e.startTurn', (combatant: CombatantPF2e, _encounter: EncounterPF2e, _id) => {
    if (!combatant.actor) {
        return;
    }
    hook(ifActorHasSustainEffectCreateMessage, combatant.actor)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .run();
    hook(createChatMessageOnTurnStartIfTokenIsAntagonized, combatant)
                    .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
                    .run();
    hook(postMessagesForWithinEffects, combatant)
                    .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
                    .run();
});

//pf2e.endTurn only runs for the GM
Hooks.on('pf2e.endTurn', (combatant: CombatantPF2e, _encounter: EncounterPF2e, _id) => {
    hook(handleFrightenedAtTurnEnd, combatant)
                    .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
                    .run();
});

Hooks.on('preDeleteItem', async (item: ItemPF2e, _action, _id) => {
    hook(createSpellNotSustainedChatMessage, item)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .run();
    hook(deleteTemplateLinkedToSustainedEffect, item)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .run();
    hook(warnIfDeletedItemIsFrightenedWhileAntagonized, item)
                    .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
                    .run();
});

Hooks.on('moveToken', (token: TokenPF2e, movement, _action, _user: UserPF2e) => {
    hook(addOrRemoveWithinEffectIfNeeded, token, movement.passed.cost)
                    .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
                    .run();
});

// V13 Only
Hooks.on("renderChatInput", (_app: ChatLog, cssMappings: Record<string, HTMLElement>, 
        _data, _options) => {
    hook(addDamageHelperButtonToChatUIv13, cssMappings)
                .ifEnabled(SETTINGS.DAMAGE_HELPER_BUTTON)
                .ifGM()
                .run();
});

Hooks.on("renderChatLog", (_app: ChatLog, htmlOrJQuery: JQuery | HTMLElement, 
        _data: Record<string, unknown>, _options: Record<string, unknown>) => {
    const html = getHtmlElement(htmlOrJQuery);
    hook(addDamageHelperButtonToChatUIv12, html)
                .ifEnabled(SETTINGS.DAMAGE_HELPER_BUTTON)
                .ifGM()
                .ifV12()
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
            hook(oscillateEnergy, message)
                    .ifEnabled(SETTINGS.AUTO_CONSERVATION_OF_ENERGY)
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
            hook(applyAntagonizeIfValid, message)
                    .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
                    .ifGM()
                    .run();
            break;
        case "flat-check":
            hook(checkForUnstableCheck, message)
                    .ifEnabled(SETTINGS.AUTO_UNSTABLE_CHECK)
                    .ifGM()
                    .run();
            hook(handleHomebrewUnstableCheckResult, message)
                    .ifEnabled(SETTINGS.UNSTABLE_CHECK_HOMEBREW)
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
            hook(manifestEidolon, message)
                    .ifEnabled(SETTINGS.AUTO_MANIFEST_EIDOLON)
                    .ifMessagePosterAndActorOwner()
                    .run();
            break;
        case "spell":
        case "spell-cast":
            hook(checkIfSpellInChatIsSustain, message)
                    .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                    .ifMessagePosterAndActorOwner()
                    .run();
            hook(runBoostEidolonAutomation, message)
                    .ifEnabled(SETTINGS.AUTO_BOOST_EIDOLON)
                    .ifMessagePosterAndActorOwner()
                    .run();
            break;
    }
}

function getMessageType(message: ChatMessagePF2e) {
    return message.flags?.pf2e?.context?.type 
    ?? message.flags?.pf2e?.origin?.type 
    ?? message.flags?.[MODULE_ID]?.type;
}

function hook<T extends unknown[]>(func: (...args: T) => void, ...args: T): HookRunner<T> {
    return new HookRunner<T>(func, ...args);
}

class HookRunner<T extends unknown[]> {
    func: (...args: T) => boolean | void;
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

    ifUser(userId: string): this {
        if (game.user.id != userId) {
            this.shouldRun = false;
        }
        return this;
    }

    ifV12(): this {
        if (!game.version.startsWith("12.")) {
            this.shouldRun = false;
        }
        return this;
    }

    run() {
        if (this.shouldRun) {
            return this.func(...this.args);
        }
        return false;
    }
}