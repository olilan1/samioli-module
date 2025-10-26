import { TokenPF2e } from "foundry-pf2e";
import { getTokenIdsFromTokens, getEnemyTokensFromTokenArray, createTemplateAtPoint } from "../utils.ts";
import { ImageFilePath } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

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
    await replaceTargets(getTokenIdsFromTokens(finalTargets));

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
    // apply the dazzling display immunity effect to the affected tokens
    await applyDazzlingDisplayImmunityEffectToTokens(finalTargets);
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

async function applyDazzlingDisplayImmunityEffectToTokens(tokens: TokenPF2e[]) {

    const image = "icons/skills/melee/maneuver-sword-katana-yellow.webp";

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

async function animateDazzlingDisplay(token: TokenPF2e) {

    const animations = [
        "jb2a.melee_attack.01.trail.02.orangered.1",
        "jb2a.melee_attack.01.trail.02.orangered.2",
        "jb2a.melee_attack.01.trail.02.orangered.3",
        "jb2a.melee_attack.01.trail.02.pinkpurple.1",
        "jb2a.melee_attack.01.trail.02.pinkpurple.2",
        "jb2a.melee_attack.01.trail.02.pinkpurple.3",
        "jb2a.melee_attack.01.trail.02.blueyellow.1",
        "jb2a.melee_attack.01.trail.02.blueyellow.2",
        "jb2a.melee_attack.01.trail.02.blueyellow.3"
    ]


    const rotations = [0, 90, 180, 270];

    const sounds = [
        "sound/NWN2-Sounds/cb_sw_bladehi1.WAV",
        "sound/NWN2-Sounds/cb_sw_bladehi2.WAV",
        "sound/NWN2-Sounds/cb_sw_bladelow1.WAV",
        "sound/NWN2-Sounds/cb_sw_bladelow2.WAV",
        "sound/NWN2-Sounds/cb_sw_blade01.WAV",
        "sound/NWN2-Sounds/cb_sw_blade02.WAV",
        "sound/NWN2-Sounds/cb_sw_blade03.WAV",
        "sound/NWN2-Sounds/cb_sw_blade04.WAV"
    ]

    const repetions = 24;
    const minWait = -1200;
    const maxWait = -1400;

    const sequence = new Sequence()
        for (let i = 0; i < repetions; i++) {
            let offset = {x: 0, y: 0};

            const rotation = Sequencer.Helpers.random_array_element(rotations)
            const offsetAmount = Sequencer.Helpers.random_float_between(0.3, 0.5);

            if (rotation === 0 ){
                offset = {x: offsetAmount, y: -offsetAmount};
            } else if (rotation === 90 ){
                offset = {x: -offsetAmount, y: -offsetAmount};
            } else if (rotation === 180 ){
                offset = {x: -offsetAmount, y: offsetAmount};
            } else if (rotation === 270 ){
                offset = {x: offsetAmount, y: offsetAmount};
            };

            sequence.sound()
                .file(Sequencer.Helpers.random_array_element(sounds))
                .playIf(() => (i % 2 === 0))
            sequence.effect()
                .file(animations)
                // @ts-expect-error offset is clashing with Foundry types
                .atLocation(token, {offset: offset, gridUnits: true, local: false})
                .rotate(rotation)
                .scale(Sequencer.Helpers.random_float_between(0.8, 1.3))
                .waitUntilFinished(minWait, maxWait)
        }
    sequence.play();
}