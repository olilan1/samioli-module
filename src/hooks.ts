import { registerSettings, SETTINGS } from "./settings.ts";
import { addAutoButtonToMessage, canAddAutoButton } from "./chatautobuttons.ts";
import { startTumbleThrough } from "./actions/tumblethrough.ts";
import { editEnjoyTheShowSkillRoll, startEnjoyTheShow } from "./actions/enjoytheshow.ts";
import {
    applyPanacheForActor,
    applyPanacheForParryOrBuckler,
    handleFinisherAttack,
    clearPanacheForActor,
    isParryOrBuckleEligible
} from "./effects/panache.ts";
import { startHuntPrey } from "./actions/huntprey.ts";
import {
    targetTokensUnderTemplate,
    deleteTemplateTargets,
    setTemplateColorToBlack,
    isLastTargetedTemplate
} from "./templatetarget.ts";
import { applyUnstableEffectOnFailure } from "./effects/unstablecheck.ts";
import {
    ChatMessagePF2e,
    CombatantPF2e,
    EffectPF2e,
    EncounterPF2e,
    ItemPF2e,
    MeasuredTemplateDocumentPF2e,
    TokenDocumentPF2e,
    TokenPF2e,
    UserPF2e
} from "foundry-pf2e";
import {
    runMatchingTemplateDeletionFunction,
    runMatchingTemplateFunctionAsCreator,
    runMatchingTemplateFunctionAsGm
} from "./triggers.ts";
import {
    postSustainMessagesForActor,
    addSustainEffectToCaster,
    associateTemplateWithSustainedEffect,
    handleSustainedEffectDeletion,
    createSpellNotSustainedChatMessage,
    isAutomaticSustainSpell
} from "./sustain.ts";
import {
    applyAntagonizeIfValid,
    postAntagonizedTurnStartMessage,
    warnIfDeletedItemIsFrightenedWhileAntagonized
} from "./actions/antagonize.ts";
import { handleFrightenedAtTurnEnd } from "./effects/frightened.ts";
import { addButtonClickHandlers } from "./chatbuttonhelper.ts";
import {
    postMessagesForWithinEffects,
    deleteWithinEffectsForTemplate,
    addEffectsToTokensInStartOfTurnTemplates,
    addOrRemoveWithinEffectIfNeeded,
    START_OF_TURN_SPELLS
} from "./startofturnspells.ts";
import ChatLog from "foundry-pf2e/foundry/client/applications/sidebar/tabs/chat.mjs";
import { addDamageHelperButtonToChatUIv12, addDamageHelperButtonToChatUIv13 } from "./damagehelper.ts";
import { getHtmlElement, MODULE_ID } from "./utils.ts";
import { handleHomebrewUnstableCheckResult, replaceUnstableCheckWithStrainCheck } from "./unstablehomebrew.ts";
import { runBoostEidolonAutomation } from "./spells/boosteidolon.ts";
import { manifestEidolon } from "./actions/manifesteidolon.ts";
import { registerSocket } from "./sockets.ts";
import { oscillateEnergy, isOscillateSpellCast } from "./conservationofenergy.ts";
import { startImaginaryWeapon } from "./spells/imaginaryweapon.ts";
import { addDancingBladeDamageButtons } from "./spells/dancingblade-anim.ts";
import {
    deleteGhostlyCarrierEffectFromCaster,
    deleteGhostlyCarrierTokenOnEffectDeletion,
    moveGhostlyCarrierToCaster
} from "./spells/ghostlycarrier.ts";
import { samiOliModuleAPI } from "./api.ts";
import Module from "foundry-pf2e/foundry/client/packages/module.mjs";
import {
    resolveMirrorImageOnAttack,
    handleMirrorImageCreated,
    handleMirrorImageUpdated,
    handleMirrorImageDeleted,
    resolveMirrorImageRoll
} from "./spells/mirrorimage.ts";
import { hook } from "./hookrunner.ts";

export { hook, HookRunner } from "./hookrunner.ts";

Hooks.on("init", () => {
    registerSettings();
    const module = game.modules.get("samioli-module");
    if (module) {
        (module as Module & { api: typeof samiOliModuleAPI }).api = samiOliModuleAPI;
    }
});

Hooks.once("socketlib.ready", () => {
    registerSocket();
});

Hooks.on("renderChatMessage", async (message: ChatMessagePF2e, html: JQuery<HTMLElement>) => {
    hook(addAutoButtonToMessage, message, html)
        .if(() => canAddAutoButton(message))
        .run();
    hook(editEnjoyTheShowSkillRoll, message, html)
        .ifMessageOption("origin:item:slug:enjoy-the-show")
        .run();
    hook(addButtonClickHandlers, message, html)
        .ifMessageHasFlag(MODULE_ID, "buttonSlug")
        .run();
    hook(replaceUnstableCheckWithStrainCheck, message, html)
        .ifEnabled(SETTINGS.UNSTABLE_CHECK_HOMEBREW)
        .ifMessageOptionAny("origin:item:trait:unstable", "self:action:trait:unstable")
        .run();
    hook(addDancingBladeDamageButtons, message, html)
        .ifMessageOption("samioli-module:dancing-blade-attack")
        .run();
});

Hooks.on("createMeasuredTemplate", async (
    template: MeasuredTemplateDocumentPF2e,
    _context,
    userId
) => {
    // Check for matching origin and run matching function if found (see triggers.ts)
    let ranTemplateTrigger = hook(runMatchingTemplateFunctionAsGm, template)
        .ifGM()
        .allowUnfilteredRun()
        .run();
    ranTemplateTrigger ||= hook(runMatchingTemplateFunctionAsCreator, template)
        .ifUser(userId)
        .allowUnfilteredRun()
        .run();

    if (!ranTemplateTrigger) {
        // If no matching origin, target tokens if that feature is enabled
        hook(targetTokensUnderTemplate, template, userId)
            .ifEnabled(SETTINGS.TEMPLATE_TARGET)
            .allowUnfilteredRun()
            .run();
    }

    hook(associateTemplateWithSustainedEffect, template)
        .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
        .ifGM()
        .if(() => template.actor?.items.some(
            i => i.type === "effect" && (i.slug?.startsWith("sustaining-effect-") ?? false)
        ) ?? false)
        .run();

    hook(addEffectsToTokensInStartOfTurnTemplates, template)
        .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
        .ifGM()
        .if(() => {
            const slug = (template.flags.pf2e?.origin as { slug?: string } | undefined)?.slug;
            return !!slug && START_OF_TURN_SPELLS.includes(slug);
        })
        .run();
});

Hooks.on("preCreateMeasuredTemplate", (
    template: MeasuredTemplateDocumentPF2e,
    _data,
    _context,
    _userId
) => {
    hook(setTemplateColorToBlack, template)
        .ifEnabled(SETTINGS.TEMPLATE_COLOUR_OVERRIDE)
        .allowUnfilteredRun()
        .run();
});

Hooks.on("deleteMeasuredTemplate", (template: MeasuredTemplateDocumentPF2e) => {
    hook(runMatchingTemplateDeletionFunction, template)
        .ifGM()
        .allowUnfilteredRun()
        .run();
    hook(deleteTemplateTargets, template)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET)
        .if(() => isLastTargetedTemplate(template.id))
        .run();
    hook(deleteWithinEffectsForTemplate, template)
        .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
        .ifGM()
        .if(() => !!template.getFlag("samioli-module", "startOfTurnEffectUuid")
            || !!template.getFlag("samioli-module", "spellSource"))
        .run();
});

Hooks.on("createChatMessage", (message: ChatMessagePF2e, _rollmode, _userId) => {
    handleChatMessageWithRoll(message);
    if (game.modules.get("dice-so-nice")?.active
        && message.isRoll
        && message.rolls.some(roll => roll.dice.length > 0)) {
        // Includes a roll, message will be posted by DiceSoNice
        return;
    }
    handleChatMessagePostRoll(message);
});

Hooks.on("diceSoNiceRollComplete", (id: string) => {
    const message = game.messages.get(id);
    if (message) {
        handleChatMessagePostRoll(message);
    }
});

// pf2e.startTurn only runs for the GM
Hooks.on("pf2e.startTurn", (combatant: CombatantPF2e, _encounter: EncounterPF2e, _id) => {
    if (!combatant.actor) return;
    hook(postSustainMessagesForActor, combatant.actor)
        .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
        .ifActorHasEffectWithSlugPrefix("sustaining-effect-")
        .run();
    hook(postAntagonizedTurnStartMessage, combatant)
        .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
        .ifActorHasEffect("samioli-antagonized")
        .run();
    hook(postMessagesForWithinEffects, combatant)
        .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
        .ifActorHasEffectWithFlag("samioli-module", "startOfTurnSpellUuid")
        .run();
});

// pf2e.endTurn only runs for the GM
Hooks.on("pf2e.endTurn", (combatant: CombatantPF2e, _encounter: EncounterPF2e, _id) => {
    hook(handleFrightenedAtTurnEnd, combatant)
        .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
        .ifActorHasCondition("frightened")
        .run();
});

Hooks.on("preDeleteItem", async (item: ItemPF2e, _action, _id) => {
    hook(createSpellNotSustainedChatMessage, item)
        .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
        .ifItemType("effect")
        .ifItemSlugStartsWith("sustaining-effect-")
        .run();
    hook(handleSustainedEffectDeletion, item)
        .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
        .ifItemType("effect")
        .ifItemSlugStartsWith("sustaining-effect-")
        .run();
    hook(warnIfDeletedItemIsFrightenedWhileAntagonized, item)
        .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
        .ifItemType("condition")
        .ifItemSlug("frightened")
        .run();
    hook(deleteGhostlyCarrierTokenOnEffectDeletion, item)
        .ifItemType("effect")
        .ifItemSlug("samioli-ghostly-carrier")
        .run();
});

Hooks.on("preDeleteToken", async (token: TokenDocumentPF2e, _action, _id) => {
    hook(deleteGhostlyCarrierEffectFromCaster, token)
        .ifGM()
        .ifTokenHasFlag("samioli-module", "ghostlyCarrierEffectUUID")
        .run();
});

Hooks.on("moveToken", (token: TokenPF2e, movement, _action, _user: UserPF2e) => {
    hook(addOrRemoveWithinEffectIfNeeded, token, movement.passed.cost)
        .ifGM()
        .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
        .ifSceneHasTemplateWithFlag("samioli-module", "isStartOfTurnSpell")
        .run();
    hook(moveGhostlyCarrierToCaster, token, movement.destination.x, movement.destination.y)
        .ifGM()
        .ifActorHasEffect("samioli-ghostly-carrier")
        .run();
});

Hooks.on("createItem", (item: ItemPF2e, _context: unknown, userId: string) => {
    hook(handleMirrorImageCreated, item as EffectPF2e)
        .ifUser(userId)
        .ifItemType("effect")
        .ifItemSlug("spell-effect-mirror-image")
        .run();
});

Hooks.on("updateItem", (
    item: ItemPF2e,
    changes: Record<string, unknown>,
    _context: unknown,
    userId: string
) => {
    hook(handleMirrorImageUpdated, item as EffectPF2e, changes)
        .ifUser(userId)
        .ifItemType("effect")
        .ifItemSlug("spell-effect-mirror-image")
        .run();
});

Hooks.on("deleteItem", (item: ItemPF2e, _context: unknown, userId: string) => {
    hook(handleMirrorImageDeleted, item as EffectPF2e)
        .ifUser(userId)
        .ifItemType("effect")
        .ifItemSlug("spell-effect-mirror-image")
        .run();
});

// V13 Only
Hooks.on("renderChatInput", (_app: ChatLog, cssMappings: Record<string, HTMLElement>,
    _data, _options) => {
    hook(addDamageHelperButtonToChatUIv13, cssMappings)
        .ifEnabled(SETTINGS.DAMAGE_HELPER_BUTTON)
        .ifGM()
        .allowUnfilteredRun()
        .run();
});

Hooks.on("renderChatLog", (_app: ChatLog, htmlOrJQuery: JQuery | HTMLElement,
    _data: Record<string, unknown>, _options: Record<string, unknown>) => {
    const html = getHtmlElement(htmlOrJQuery);
    hook(addDamageHelperButtonToChatUIv12, html)
        .ifEnabled(SETTINGS.DAMAGE_HELPER_BUTTON)
        .ifGM()
        .ifV12()
        .allowUnfilteredRun()
        .run();
});

function handleChatMessageWithRoll(message: ChatMessagePF2e) {
    switch (getMessageType(message)) {
        case "attack-roll":
            hook(startImaginaryWeapon, message)
                .ifMessagePosterAndActorOwner()
                .ifMessageOption("item:imaginary-weapon")
                .run();
            break;
        case "damage-roll":
            break;
        case "skill-check":
            break;
        case "flat-check":
            break;
        case "action":
            break;
        case "spell":
        case "spell-cast":
            break;
    }
}

function handleChatMessagePostRoll(message: ChatMessagePF2e) {
    switch (getMessageType(message)) {
        case "attack-roll":
            hook(applyPanacheForParryOrBuckler, message)
                .ifEnabled(SETTINGS.AUTO_PANACHE)
                .ifGM()
                .ifMessageHasTarget()
                .if(() => isParryOrBuckleEligible(message))
                .run();
            hook(handleFinisherAttack, message)
                .ifEnabled(SETTINGS.AUTO_PANACHE)
                .ifGM()
                .ifMessageOption("finisher")
                .run();
            hook(applyPanacheForActor, message)
                .ifEnabled(SETTINGS.AUTO_PANACHE)
                .ifGM()
                .ifMessageOption("item:trait:bravado")
                .ifNotMessageOption("action:tumble-through")
                .ifNotMessageOption("item:slug:enjoy-the-show")
                .ifMessageOutcomeIn("failure", "success", "criticalSuccess")
                .run();
            hook(resolveMirrorImageOnAttack, message)
                .ifEnabled(SETTINGS.AUTO_MIRROR_IMAGE)
                .ifGM()
                .ifMessageHasTarget()
                .ifTargetHasEffect("spell-effect-mirror-image")
                .ifMessageOutcomeIn("failure", "success", "criticalSuccess")
                .run();
            break;
        case "damage-roll":
            hook(clearPanacheForActor, message)
                .ifEnabled(SETTINGS.AUTO_PANACHE)
                .ifGM()
                .ifMessageOption("finisher")
                .run();
            hook(oscillateEnergy, message)
                .ifEnabled(SETTINGS.AUTO_CONSERVATION_OF_ENERGY)
                .ifGM()
                .ifMessageOption("class:psychic")
                .ifMessageOption("feature:the-oscillating-wave")
                .if(() => isOscillateSpellCast(message))
                .run();
            break;
        case "skill-check":
            hook(startTumbleThrough, message)
                .ifMessagePoster()
                .ifMessageOption("action:tumble-through")
                .run();
            hook(startEnjoyTheShow, message)
                .ifMessagePoster()
                .ifMessageOption("item:slug:enjoy-the-show")
                .run();
            hook(applyPanacheForActor, message)
                .ifEnabled(SETTINGS.AUTO_PANACHE)
                .ifGM()
                .ifMessageOption("item:trait:bravado")
                .ifNotMessageOption("action:tumble-through")
                .ifNotMessageOption("item:slug:enjoy-the-show")
                .ifMessageOutcomeIn("success", "failure", "criticalSuccess")
                .run();
            hook(applyAntagonizeIfValid, message)
                .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
                .ifGM()
                .ifMessageOption("action:demoralize")
                .ifMessageOutcomeIn("success", "criticalSuccess")
                .ifActorHasFeat("antagonize")
                .run();
            break;
        case "flat-check":
            hook(applyUnstableEffectOnFailure, message)
                .ifEnabled(SETTINGS.AUTO_UNSTABLE_CHECK)
                .ifGM()
                .ifMessageOption("unstable-check")
                .ifMessageOutcomeIn("failure", "criticalFailure")
                .run();
            hook(handleHomebrewUnstableCheckResult, message)
                .ifEnabled(SETTINGS.UNSTABLE_CHECK_HOMEBREW)
                .ifGM()
                .ifMessageOption("samioli-unstable-check")
                .run();
            break;
        case "action":
            hook(startHuntPrey, message)
                .ifEnabled(SETTINGS.AUTO_HUNT_PREY)
                .ifMessagePosterAndActorOwner()
                .ifMessageItemSlug("hunt-prey")
                .run();
            hook(manifestEidolon, message)
                .ifEnabled(SETTINGS.AUTO_MANIFEST_EIDOLON)
                .ifMessagePosterAndActorOwner()
                .ifMessageItemSlug("manifest-eidolon")
                .run();
            break;
        case "spell":
        case "spell-cast":
            hook(addSustainEffectToCaster, message)
                .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
                .ifMessagePosterAndActorOwner()
                .if(() => isAutomaticSustainSpell(message.item))
                .run();
            hook(runBoostEidolonAutomation, message)
                .ifEnabled(SETTINGS.AUTO_BOOST_EIDOLON)
                .ifMessagePosterAndActorOwner()
                .ifMessageItemSlug("boost-eidolon")
                .run();
            break;
        case "mirror-image-roll":
            hook(resolveMirrorImageRoll, message)
                .ifGM()
                .allowUnfilteredRun()
                .run();
            break;
    }
}

function getMessageType(message: ChatMessagePF2e) {
    return message.flags?.pf2e?.context?.type
        ?? message.flags?.pf2e?.origin?.type
        ?? message.flags?.[MODULE_ID]?.type;
}