import { TokenPF2e, TokenDocumentPF2e } from "foundry-pf2e";
import { getTokenIdsFromTokens, getEnemyTokensFromTokenArray, createTemplateAtPoint } from "../utils.ts";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";
import { DAZZLING_DISPLAY, getSocket } from "../sockets.ts";

export async function startDazzlingDisplay(token: TokenPF2e) {
    // Create a 30 ft radius template at the token's position
    const creatorUserId = game?.user.id;
    const tokenPoint = {x: token.x, y: token.y};
    const template = await createTemplateAtPoint(tokenPoint, creatorUserId, 30, "circle");

    // capture all targets in the area of effect
    const allTargets = await getTemplateTokens(template);

    // remove allies and neutrals from the target list
    const enemyTargets = getEnemyTokensFromTokenArray(token, allTargets);

    // remove any tokens that have the dazzling display immunity effect
    const finalTargets = enemyTargets.filter(t => !t.actor?.items.some(item => 
        item.type === "effect" && item.slug === "samioli-dazzling-display-immunity")
    );

    // delete the template
    await template.delete();

    // add tokens to current player's target list
    const finalTargetIds = getTokenIdsFromTokens(finalTargets);
    await replaceTargets(finalTargetIds);

    // animate the dazzling display
    await animateDazzlingDisplay(token);

    // run demoralize action on the remaining targets
    const demoralizeMacro = await getDemoralizeMacro();
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
        } else {
            demoralizeMacro.execute();
        }
    } else {
        ui.notifications?.warn("Workbench Demoralize macro not found.");
        return;
    }

    getSocket().executeAsGM(DAZZLING_DISPLAY, finalTargets.map(token => token.document.uuid));

}

export async function startDazzlingDisplayAsGM(targetsUuids: string[]) {
    
    const image = "icons/skills/melee/maneuver-sword-katana-yellow.webp"
    const targets = targetsUuids.map( uuid => fromUuidSync<TokenDocumentPF2e>(uuid)!);

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
    
    for (const target of targets) {
        await target.actor?.createEmbeddedDocuments("Item", [dazzingDisplayImmunityEffectData]);
    }
}

async function getDemoralizeMacro(): Promise<Macro | null> {
    const compendiumName = "xdy-pf2e-workbench.asymonous-benefactor-macros-internal";
    const macroName = "XDY DO_NOT_IMPORT Demoralize";
    const pack = game.packs.get(compendiumName);
    if (!pack) return null;
    const macro = await pack.getDocuments({name: macroName}) as Macro[];
    if (macro.length === 0) return null;
    return macro[0];
}

async function animateDazzlingDisplay(token: TokenPF2e) {

    const anim = "jb2a.energy_strands.complete.grey.01";
    const sound = "sound/NWN2-Sounds/cb_whirlwind.WAV";

    const sequence = new Sequence()
        .effect()
            .file(anim)
            .atLocation(token)
            .scale(1)
            .fadeIn(300)
            .fadeOut(500)
            .duration(3000)
        .sound()
            .file(sound)
            .volume(0.5)
            .fadeInAudio(100)
            .fadeOutAudio(400)
            .duration(2800)
    sequence.play();
}