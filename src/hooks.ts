import { SamiOliHooks } from "./types/hook-types.ts";
import { registerSettings, SETTINGS } from "./settings.ts";
import { addAutoButtonToMessage, canAddAutoButton } from "./chatautobuttons.ts";
import { startTumbleThrough } from "./actions/tumblethrough.ts";
import { editEnjoyTheShowSkillRoll, startEnjoyTheShow } from "./actions/enjoytheshow.ts";
import {
    applyPanacheForActor,
    applyPanacheForParryOrBuckler,
    handleFinisherAttack,
    clearPanacheForActor,
    isPanacheGeneratingParryOrBuckler
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
    RegionDocumentPF2e,
    TokenDocumentPF2e,
    TokenPF2e,
    UserPF2e
} from "foundry-pf2e";
import {
    runMatchingRegionDeletionFunction,
    runMatchingRegionFunctionAsCreator,
    runMatchingRegionFunctionAsGm
} from "./triggers.ts";
import {
    postSustainMessagesForActor,
    addSustainEffectToCaster,
    associateTemplateWithSustainedEffect,
    hasSustainingEffect,
    handleSustainedEffectDeletion,
    createSpellNotSustainedChatMessage,
    isAutomaticSustainSpell,
    expireUnsustainedEffectsForActor
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
    injectStartOfTurnBehaviorsToRegion,
    hasStartOfTurnFlags
} from "./startofturnspells.ts";
import ChatLog from "foundry-pf2e/foundry/client/applications/sidebar/tabs/chat.mjs";
import { addDamageHelperButtonToChatUIv13 } from "./damagehelper.ts";
import { MODULE_ID } from "./utils.ts";
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

const Hooks = globalThis.Hooks as SamiOliHooks;

Hooks.on("init", () => {
    registerSettings();
    const module = game.modules.get("samioli-module");
    if (module) {
        (module as unknown as Module & { api: typeof samiOliModuleAPI }).api = samiOliModuleAPI;
    }
});

Hooks.once("socketlib.ready", () => {
    registerSocket();
});

Hooks.on(
    "renderChatMessageHTML",
    async (message: ChatMessagePF2e, html: HTMLElement) => {
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
            .ifMessageOptionAny(
                "origin:item:trait:unstable",
                "self:action:trait:unstable"
            )
            .run();
        hook(addDancingBladeDamageButtons, message, html)
            .ifMessageType("attack-roll")
            .ifMessageOption("samioli-module:dancing-blade-attack")
            .run();
    }
);

Hooks.on("createRegion", async (
    region: RegionDocumentPF2e,
    _context: unknown,
    userId: string
) => {
    // Check for matching origin and run matching function if found (see triggers.ts)
    let ranRegionTrigger = hook(runMatchingRegionFunctionAsGm, region)
        .ifGM()
        .allowUnfilteredRun()
        .run();
    ranRegionTrigger ||= hook(runMatchingRegionFunctionAsCreator, region)
        .ifUser(userId)
        .allowUnfilteredRun()
        .run();

    if (!ranRegionTrigger) {
        // If no matching origin, target tokens if that feature is enabled
        hook(targetTokensUnderTemplate, region, userId)
            .ifEnabled(SETTINGS.TEMPLATE_TARGET)
            .allowUnfilteredRun()
            .run();
    }

    hook(associateTemplateWithSustainedEffect, region)
        .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
        .ifGM()
        .if(hasSustainingEffect)
        .run();
});

Hooks.on("preCreateRegion", (
    region: RegionDocumentPF2e,
    _data: unknown,
    _context: unknown,
    _userId: string
) => {
    hook(setTemplateColorToBlack, region)
        .ifEnabled(SETTINGS.TEMPLATE_COLOUR_OVERRIDE)
        .allowUnfilteredRun()
        .run();
    hook(injectStartOfTurnBehaviorsToRegion, region)
        .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
        .allowUnfilteredRun()
        .run();
});

Hooks.on("deleteRegion", (
    region: RegionDocumentPF2e,
    _options: unknown,
    _userId: string
) => {
    hook(runMatchingRegionDeletionFunction, region)
        .ifGM()
        .allowUnfilteredRun()
        .run();
    hook(deleteTemplateTargets, region)
        .ifEnabled(SETTINGS.TEMPLATE_TARGET)
        .if(() => isLastTargetedTemplate(region.id))
        .run();
    hook(deleteWithinEffectsForTemplate, region)
        .ifEnabled(SETTINGS.AUTO_START_OF_TURN_SPELL_CHECK)
        .ifGM()
        .if(hasStartOfTurnFlags)
        .run();
});

Hooks.on("createChatMessage", (message: ChatMessagePF2e, _rollmode: unknown, _userId: string) => {
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
Hooks.on("pf2e.startTurn", (combatant: CombatantPF2e, _encounter: EncounterPF2e, _id: string) => {
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
Hooks.on("pf2e.endTurn", (combatant: CombatantPF2e, _encounter: EncounterPF2e, _id: string) => {
    if (!combatant.actor) return;
    hook(expireUnsustainedEffectsForActor, combatant.actor)
        .ifEnabled(SETTINGS.AUTO_SUSTAIN_CHECK)
        .ifActorHasEffectWithSlugPrefix("sustaining-effect-")
        .run();
    hook(handleFrightenedAtTurnEnd, combatant)
        .ifEnabled(SETTINGS.AUTO_FRIGHTENED_AND_ANTAGONIZE_CHECK)
        .ifActorHasCondition("frightened")
        .run();
});

Hooks.on("preDeleteItem", async (item: ItemPF2e, _action: string, _id: string) => {
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

Hooks.on("preDeleteToken", async (token: TokenDocumentPF2e, _action: string, _id: string) => {
    hook(deleteGhostlyCarrierEffectFromCaster, token)
        .ifGM()
        .ifTokenHasFlag("samioli-module", "ghostlyCarrierEffectUUID")
        .run();
});

Hooks.on(
    "moveToken",
    (
        token: TokenPF2e,
        movement: { passed: { cost: number }; destination: { x: number; y: number } },
        _action: string,
        _user: UserPF2e
    ) => {
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

Hooks.on("renderChatInput", (_app: ChatLog, cssMappings: Record<string, HTMLElement>,
    _data: unknown, _options: unknown) => {
    hook(addDamageHelperButtonToChatUIv13, cssMappings)
        .ifEnabled(SETTINGS.DAMAGE_HELPER_BUTTON)
        .ifGM()
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
                .if(() => isPanacheGeneratingParryOrBuckler(message))
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
                .ifMessageOption("origin:item:hunt-prey")
                .run();
            hook(manifestEidolon, message)
                .ifEnabled(SETTINGS.AUTO_MANIFEST_EIDOLON)
                .ifMessagePosterAndActorOwner()
                .ifMessageOption("origin:item:slug:manifest-eidolon")
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
                .ifMessageOption("origin:item:slug:boost-eidolon")
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