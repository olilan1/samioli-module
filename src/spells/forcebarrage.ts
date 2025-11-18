import { ChatMessagePF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { delay } from "../utils.ts";
import { CrosshairUpdatable, CustomTemplateData } from "../types.ts";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { getTemplateTokens } from "../templatetarget.ts";

const { DialogV2 } = foundry.applications.api;

type Tradition = "arcane" | "occult";
type BonusDamageSource = "sorcerous-potency" | "unleash-psyche-damage";

export async function selectForceBarrageTargets(token: TokenPF2e, message: ChatMessagePF2e) {

    // ask player how many actions they want to use
    const numberOfActions = await selectNumberOfActionsDialog();
    if (!numberOfActions) return;

    // determine how many missiles the caster will have based on casting rank
    const castRank = message.flags.pf2e.origin?.castRank;
    if (!castRank) return;
    const numberOfShards = numberOfActions * Math.ceil(castRank / 2)

    // Ask player to designate shards to the tokens on the board
    const targets = [];
    let remainingShards = numberOfShards;
    do  {
        const templateData = await startCrosshairsTargetSelection(token, remainingShards);
        if (!templateData && targets.length === 0) {
            ui.notifications.error("Force barrage selection cancelled.");
            return;
        } else if (!templateData && targets.length > 0) {
            targets.pop();
            remainingShards++;
            ui.notifications.warn("Last selected target removed.");
            continue;
        }

        const target = await getTokenAtLocation(templateData);

        if (!target) {
            ui.notifications.error("Please select a valid target.");
            continue;
        } else {
            targets.push(target);
            remainingShards--;
        }
    } while (remainingShards > 0);

    // Translate into a map of tokens and the number of shards targeted with. For Damage Roll
    const targetMap = translateTargetsArrayToMap(targets);
    
    // Slight delay before animating
    await delay(500);
    await animateForceBarrage(token, targets);

    // Extract additional spell context for damage roll and chat message
    const rollOptions = message.flags.pf2e.origin?.rollOptions;
    let tradition : Tradition;
    let bonusDamageSource : BonusDamageSource | undefined;
    let additionalDamage = 0;

    if (rollOptions?.includes("origin:item:trait:arcane")) {
        tradition = "arcane";
    } else {
        tradition = "occult";
    }

    if (message.actor?.getRollOptions()?.includes("sorcerous-potency")) {
        bonusDamageSource = "sorcerous-potency";
        additionalDamage = castRank;
    } else if (message.actor?.itemTypes.effect.some(effect => effect.slug === "effect-unleash-psyche")) {
        bonusDamageSource = "unleash-psyche-damage";
        additionalDamage = castRank * 2;
    }

    // Another small delay before rolling all the dice
    await delay(500);

    // Roll damage for each target, increasing the damage dice based on the number of shards
    targetMap.forEach((shards, target) => {
        const damageRoll = createDamageRollPerTarget(shards, additionalDamage);
        const flavor = getFlavor(tradition, shards, additionalDamage, bonusDamageSource);
        sendRollToChat(damageRoll, message.item as SpellPF2e, target, flavor);
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

async function getTokenAtLocation(location: Point) : Promise<TokenPF2e | undefined> {
    const myTemplateData = createCustomTemplateData(location);
    const myTemplate = await createTemplate(myTemplateData);
    const targets = await getTemplateTokens(myTemplate);
    const target = targets[0]
    await myTemplate.delete();
    if (!target) return;
    return target;
}

async function createTemplate(templateData: CustomTemplateData): Promise<MeasuredTemplateDocumentPF2e> {

    const myCustomTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
    if (!myCustomTemplate) {
        throw new Error("Failed to create template");
    }
    return myCustomTemplate as MeasuredTemplateDocumentPF2e;
}

function createCustomTemplateData(location: Point): CustomTemplateData {

    const offset = canvas.scene!.grid.size / 2;

    const templateShape = "rect";
    const templateWidth = 5;
    const templateDistance = 7.0710678118654755; // Diagonal for rect template
    const templateDirection = 45; // Rect templates work on diagonals for a square

    const templateData: CustomTemplateData = {
        t: templateShape as MeasuredTemplateType,
        x: location.x - (offset),
        y: location.y - (offset),
        width: templateWidth,
        distance: templateDistance,
        direction: templateDirection,
        fillColor: "#000000ff",
        borderColor: "#000000ff"
    };
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

function createDamageRollPerTarget(numberOfShards: number, additionalDamage: number): Roll {

    const combinedDamage = numberOfShards + additionalDamage;

    const value = `${numberOfShards}d4 + ${combinedDamage}`

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll")!;

    const roll = new DamageRoll(`(${value})[force]`);
    return roll;
}

async function sendRollToChat(roll: Roll, spellItem: SpellPF2e, targetToken: TokenPF2e, 
    flavor: string) {

    const originData = spellItem.getOriginData();

    const spellDamage = await spellItem.getDamage();
    if (!spellDamage) return;

    roll.toMessage(
        {
            speaker: ChatMessage.getSpeaker(),
            flavor: flavor,
            flags: {
                pf2e: {
                    context: {
                        ...spellDamage.context,
                        options: Array.from(spellDamage.context.options ?? []),
                    },
                    origin: originData,
                },
                "pf2e-toolbelt": {
                    targetHelper: {
                        targets: [targetToken.document.uuid]
                    }
                }
                
            },
        },
        { create: true }
    );

}

function getFlavor(tradition: Tradition, numberOfShards: number, additionalDamage: number, 
    bonusDamageSource?: BonusDamageSource){

    const value = `${numberOfShards}d4 + ${numberOfShards}`

    const header = `
        <h4 class="action">
        <strong>Force Barrage</strong>
        </h4>
    `;

    const traitsHeader = `<div class="tags" data-tooltip-class="pf2e">`
    const traditionTrait = tradition === `occult` ? `<span class="tag" data-tooltip="PF2E.TraitDescriptionOccult" data-trait="occult">Occult</span>` : `<span class="tag" data-tooltip="PF2E.TraitDescriptionArcane" data-trait="arcane">Arcane</span>`;
    const remainingTraits = `
        <span class="tag" data-tooltip="PF2E.TraitDescriptionConcentrate" data-trait="concentrate">Concentrate</span>
        <span class="tag" data-tooltip="PF2E.TraitDescriptionForce" data-trait="force">Force</span>
        <span class="tag" data-tooltip="PF2E.TraitDescriptionManipulate" data-trait="manipulate">Manipulate</span>
        </div>
    `;
    const modifiers = `
        <hr />
        <div class="tags modifiers">
        <span class="tag tag_transparent">${value} Force</span>
    `;

    let bonusModifiers = ``;

    if (bonusDamageSource === "sorcerous-potency") {
        bonusModifiers = `
        <span class="tag tag_transparent">Sorcerous Potency +${additionalDamage}</span>
        `;
    } else if (bonusDamageSource === "unleash-psyche-damage") {
        bonusModifiers = `
            <span class="tag tag_transparent">Unleash Psyche +${additionalDamage}</span>
        `;
    }

    const closingDiv = `</div>`;

    return header + traitsHeader + traditionTrait + remainingTraits + modifiers + bonusModifiers + closingDiv;
}