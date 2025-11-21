import { ChatMessagePF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { delay, getTokensAtLocation } from "../utils.ts";
import { CrosshairUpdatable } from "../types.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { rollSpellDamage } from "../spelldamageroll.ts";

const { DialogV2 } = foundry.applications.api;

export async function selectForceBarrageTargets(token: TokenPF2e, message: ChatMessagePF2e) {

    // ask player how many actions they want to use
    const numberOfActions = await selectNumberOfActionsDialog();
    if (!numberOfActions) return;

    // determine how many missiles the caster will have based on casting rank
    const castRank = message.flags.pf2e.origin?.castRank;
    if (!castRank) return;
    const numberOfShards = numberOfActions * Math.ceil(castRank / 2);

    // Ask player to designate shards to the tokens on the board
    const targets = [];
    let remainingShards = numberOfShards;
    do  {
        const selectedLocation = await startCrosshairsTargetSelection(token, remainingShards) as Point;
        
        if (!selectedLocation) {
            if (targets.length < 1) {
                ui.notifications.error("Force barrage selection cancelled.");
                return;
            }
            targets.pop();
            remainingShards++;
            ui.notifications.warn("Last selected target removed.");
            continue;
        }

        const targetTokens = await getTokensAtLocation(selectedLocation);

        if (targetTokens.length === 0) {
            ui.notifications.error("Please select a valid target.");
            continue;
        } else if (targetTokens.length > 1) {
            ui.notifications.error("There are two tokens at this location.");
            continue;
        } else {
            console.log("targetTokens", targetTokens)
            targets.push(targetTokens[0]);
            console.log(targets, "targets");
            remainingShards--;
        }
    } while (remainingShards > 0);

    // Translate into a map of tokens and the number of shards targeted with. For Damage Roll
    const targetMap = translateTargetsArrayToMap(targets);
    
    // Slight delay before animating
    await delay(500);
    await animateForceBarrage(token, targets);

    // Another small delay before rolling all the dice
    await delay(1000);

    const spellItem = message.item as SpellPF2e;
    const spellDamage = await spellItem.getDamage();

    const spellRollFormula = spellDamage?.template.damage.roll._formula;
    if (!spellRollFormula) return;

    // Roll damage for each target, increasing the damage dice based on the number of shards
    targetMap.forEach(async (shards, target) => {
        const modifiedFormula = getModifyFormulasBasedOnShards(spellRollFormula, shards)
        rollSpellDamage(spellItem, target, token, 
            {
                _formula: modifiedFormula._formula, 
                formula: modifiedFormula.formula, 
                originalFormula: `1d4 + 1 Force`
            });
    });
}

async function selectNumberOfActionsDialog(): Promise<number | undefined> {

    const actions = await DialogV2.wait({
        // @ts-expect-error not all parameters are required
        window: {
            title: "How many actions?",
        },
        position: {
            height: "auto"
        },
        buttons: [
            {
                action: `1`,
                label: ``,
                icon: `fa-solid fa-1`
            },
            {
                action: `2`,
                label: ``,
                icon: `fa-solid fa-2`
            },
            {
                action: `3`,
                label: ``,
                icon: `fa-solid fa-3`
            },
        ],
    })
    return actions as number;
}

async function startCrosshairsTargetSelection(token: TokenPF2e, remainingShards: number) {

    const labelText = remainingShards === 1 
    ? `Select a target. ${remainingShards} shard remaining.` 
    : `Select a target. ${remainingShards} shards remaining.`;
    
    const crosshairWidth = 0;
    const snapPosition = CONST.GRID_SNAPPING_MODES.CENTER;
    const iconTexture = "icons/svg/explosion.svg";
    const color = "#000000ff";
    const templateData = await Sequencer.Crosshair.show({
        distance: crosshairWidth,
        fillColor: color,
        label: {
            text: labelText,
            dy: -100
        },
        location: {
            obj: token,
            limitMaxRange: 120,
            limitMinRange: 5,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
        },
        icon: {
            texture: iconTexture
        }, 
        snap: {
            position: snapPosition
        }
    }, {
        [Sequencer.Crosshair.CALLBACKS.COLLIDE]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": "icons/svg/cancel.svg"
            })
        },
        [Sequencer.Crosshair.CALLBACKS.STOP_COLLIDING]: (crosshair: CrosshairUpdatable) => {
            crosshair.updateCrosshair({
                "icon.texture": iconTexture
            })
        },
        [Sequencer.Crosshair.CALLBACKS.CANCEL]: () => {
            return false;
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        invalidPlacement: undefined,
        placed: undefined
    });
    return templateData;

}

function translateTargetsArrayToMap(targets: TokenPF2e[]) {
    // Create a map of targets and the number of times they were targetted
    const targetMap = new Map<TokenPF2e, number>();
    for (const target of targets) {
        const currentCount = targetMap.get(target) || 0;
        targetMap.set(target, currentCount + 1);
    }
    
    return targetMap;
}

async function animateForceBarrage(caster: TokenPF2e, targets: TokenPF2e[]){

    const shuffledTargets = Sequencer.Helpers.shuffle_array(targets);

    const castingSequence = new Sequence()
        castingSequence.effect()
            .file("jb2a.template_circle.out_pulse.02.burst.purplepink")
            .atLocation(caster)
            .opacity(0.7)
            .scale(0.5)
        castingSequence.sound()
            .file("sound/NWN2-Sounds/sfx_conj_Evocation.WAV")
        castingSequence.play();
    for (const target of shuffledTargets) {
        const missileSequence = new Sequence()
        missileSequence.effect()
            .file(`jb2a.magic_missile.purple`)
            .atLocation(caster)
            .stretchTo(target)
            .delay(100, 1000)
            .waitUntilFinished(-1000)
        .sound()
            .file("sound/NWN2-Sounds/sfx_hit_Magic.WAV")
        missileSequence.play();
    }
}

function getModifyFormulasBasedOnShards(_formula: string, numberOfShards: number)
    : {_formula: string, formula: string} {

    const regex = /\{?\(?(\d+)d4 \+ (\d+)\)?\}?\[([a-zA-Z\s]+)\]/;
    const match = _formula.match(regex)!;

    const originalBonus = parseInt(match[2], 10);
    
    const newBonus = numberOfShards + originalBonus - 1;

    const rollFormula = `{(${numberOfShards}d4 + ${newBonus})[force]}`;
    const tagFormula = `${numberOfShards}d4 + ${numberOfShards} Force`;
    
    return {_formula: rollFormula, formula: tagFormula};
}