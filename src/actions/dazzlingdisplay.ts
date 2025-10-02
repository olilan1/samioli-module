import { ChatMessagePF2e, MeasuredTemplateDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { getTokenIdsFromTokens, logd, returnEnemyTokensFromTokenArray } from "../utils.ts";
import { ImageFilePath, MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

export async function startDazzlingDisplay(token: TokenPF2e) {
    //Create a 30 ft radius template at the token's position
    const creatorUserId = game?.user.id;
    const template = await createTemplateAtTokenPosition(token, creatorUserId);
    if (!template) return;
    //capture all targets in the area of effect
    const allTargets = await getTemplateTokens(template);
    logd(`all targets under template:`);
    logd(allTargets);
    //remove allies and neutrals from the target list
    const enemyTargets = returnEnemyTokensFromTokenArray(token, allTargets);
    //remove an tokens that have the dazzling display immunity effect
    logd(`enemy targets for dazzling display:`);
    logd(enemyTargets);
    const finalTargets = enemyTargets.filter(t => !t.actor?.items.some(item => 
        item.type === "effect" && item.slug === "samioli-dazzling-display-immunity")
    );
    logd(`final targets for dazzling display:`);
    logd(finalTargets);
    //delete the template
    await template.delete();
    //add relevant tokens to combatant's target list
    await replaceTargets(getTokenIdsFromTokens(finalTargets));
    //run the demoralize action on the remaining targets
    const demoralizeMacro = await checkIfDemoralizeMacroIsAvailable();
    if (demoralizeMacro) {
        if (!demoralizeMacro.canExecute) {
            const clonedMacro = new Macro(
                foundry.utils.mergeObject(
                    demoralizeMacro.toObject(),
                        { "-=_id": null, "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
                        { performDeletions: true, inplace: true }
                )
            );
        clonedMacro.execute();
        } else demoralizeMacro.execute();
    } else {
        ui.notifications?.warn("Workbench Demoralize macro not found.");
        return;
    }
    //apply the dazzling display immunity effect to the affected tokens
    await applyDazzlingDisplayImmunityEffectToTokens(finalTargets);
}

async function createTemplateAtTokenPosition(token: TokenPF2e, userId: string): Promise<MeasuredTemplateDocumentPF2e | null> {
    
    const templateData = {
        t: "circle" as MeasuredTemplateType,
        sort: 99,
        distance: 30,
        x: token.x,
        y: token.y,
        user: userId
    };

    const template = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene }) as MeasuredTemplateDocumentPF2e;
    if (!template) {
        throw new Error("Failed to create template");
    }
    return template;
}

async function checkIfDemoralizeMacroIsAvailable(): Promise<Macro | undefined> {
    const compendiumName = "xdy-pf2e-workbench.asymonous-benefactor-macros-internal";
    const macroName = "XDY DO_NOT_IMPORT Demoralize";
    const pack = game.packs.get(compendiumName);
    if (!pack) return;
    const macro = await pack.getDocuments({name: macroName}) as Macro[];
    if (!macro) return;
    return macro[0];
}

async function applyDazzlingDisplayImmunityEffectToTokens(tokens: TokenPF2e[]) {

    const image = "icons/magic/death/undead-ghost-scream-teal.webp";

    const dazzingDisplayImmunityEffectData = {
        name: `Immunity to Dazzling Display`,
        type: "effect",
        img: image as ImageFilePath,
        system: {
            slug: "samioli-dazzling-display-immunity",
            description: {
                value: `<p>Immune to the effects of Dazzling Display for 1 minute.</p>`
            },
            duration: {
                value: 10,
                unit: "rounds"
            },
            tokenIcon: {
                show: true
            }
        }
    };
    
    for (const token of tokens) {
        await token.actor?.createEmbeddedDocuments("Item", [dazzingDisplayImmunityEffectData]);
    }
}

export async function animateDazzlingDisplayIfNeeded(message: ChatMessagePF2e) {
    if (!message.flags.demoralize) return;

    logd("Animating Dazzling Display");
}