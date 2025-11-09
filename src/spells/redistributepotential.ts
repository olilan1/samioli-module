import { ChatMessagePF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { CrosshairUpdatable, CustomTemplateData } from "../types.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

type RedistributePotentialType = "steal-heat" | "concentrate-heat";

const STEAL_HEAT_COLOUR: `#${string}` = "#4134d4";
const CONCENTRATE_HEAT_COLOUR: `#${string}` = "#f59042";

export async function startRedistributePotential(token: TokenPF2e, message: ChatMessagePF2e) {

    // Check if spell is amped or not
    if (!message.flags.pf2e.context?.options) return;
    const isAmped = message.flags.pf2e.context.options.includes("amp-spell");

    // Select Steal Heat location
    const stealHeatLocation = await selectLocation("steal-heat", token, isAmped);
    if (!stealHeatLocation) return;
    
    // Create Steal Heat template and get target tokens
    const stealHeatTemplateData = createCustomTemplateData(stealHeatLocation, "steal-heat", isAmped);
    if (!stealHeatTemplateData) return;
    const stealHeatTemplate = await createTemplate(stealHeatTemplateData);
    const stealHeatTargetTokens = await getTemplateTokens(stealHeatTemplate);

    // Select Concentrate Heat location
    const concentrateHeatLocation = await selectLocation("concentrate-heat", stealHeatLocation, isAmped);
    // If cancelled, clean up previous template
    if (!concentrateHeatLocation) {
        stealHeatTemplate.delete();
        return;
    }

    // Create Concentrate Heat template and get target tokens
    const concentrateHeatTemplateData = createCustomTemplateData(concentrateHeatLocation, "concentrate-heat", isAmped);
    const concentrateHeatTemplate = await createTemplate(concentrateHeatTemplateData);
    const concentrateHeatTargetTokens = await getTemplateTokens(concentrateHeatTemplate);

    // Clean up templates
    stealHeatTemplate.delete();
    concentrateHeatTemplate.delete();

    // Capture additional context for the spell damage message
    const spell = message.item as SpellPF2e;

    const spellRank = spell.rank;
    const damageFormula = getDamageDiceFormula(spellRank, isAmped);

    // Roll Steal Heat damage but don't send message yet
    const stealHeatDamageRoll = createDamageRoll(damageFormula, "steal-heat");
    const evaluatedStealHeatDamageRoll = await stealHeatDamageRoll.evaluate();
    const stealHeatDamageTotal = evaluatedStealHeatDamageRoll.total;
    const stealHeatFlavour = getFlavour("steal-heat", isAmped, damageFormula);

    await sendRolledRollToChat(evaluatedStealHeatDamageRoll, stealHeatFlavour, spell, stealHeatTargetTokens);

    // Roll Concentrate Heat damage but don't send message yet (use the same damage total as Steal Heat)
    const concentrateHeatDamageRoll = createDamageRoll(stealHeatDamageTotal.toString(), "concentrate-heat");

    const concentrateHeatFlavour = getFlavour("concentrate-heat", isAmped, damageFormula);
    
    if (game.modules.get('dice-so-nice')?.active) {
        const hookFunctionDSN = async (id: string) => {
            const message = game.messages.get(id)!;
            if (message.flags["samioli-module"]?.isRedistributePotential) {
                await sendRolledRollToChat(concentrateHeatDamageRoll, concentrateHeatFlavour, spell, concentrateHeatTargetTokens);
                Hooks.off("diceSoNiceRollComplete", hookFunctionDSN);
            }
        };
        Hooks.on("diceSoNiceRollComplete", hookFunctionDSN);
    } else {
        const hookFunction = async (message: ChatMessagePF2e) => {
            if (message.flags["samioli-module"]?.isRedistributePotential) {
                await sendRolledRollToChat(concentrateHeatDamageRoll, concentrateHeatFlavour, spell, concentrateHeatTargetTokens);
                Hooks.off("createChatMessage", hookFunction);
            }
        };
        Hooks.on("createChatMessage", hookFunction); 
    }
}

function getFlavour(type: RedistributePotentialType, isAmped: boolean, damageFormula: string) : string {
    const isAmpedText = isAmped ? " (Amped)" : "";

    const stealHeatFlavour = `
        <h4 class="action"><strong>Redistribute Potential - Steal Heat${isAmpedText}</strong></h4>
        <div class="tags" data-tooltip-class="pf2e"><span class="tag" data-tooltip="PF2E.TraitDescriptionCantrip" data-trait="cantrip">Cantrip</span><span class="tag" data-tooltip="PF2E.TraitDescriptionCold" data-trait="cold">Cold</span><span class="tag" data-tooltip="PF2E.TraitDescriptionConcentrate" data-trait="concentrate">Concentrate</span><span class="tag" data-tooltip="PF2E.TraitDescriptionManipulate" data-trait="manipulate">Manipulate</span><span class="tag" data-tooltip="PF2E.TraitDescriptionOccult" data-trait="occult">Occult</span><span class="tag" data-tooltip="PF2E.TraitDescriptionPsychic" data-trait="psychic">Psychic</span></div>
        <hr>
        <div class="tags modifiers"><span class="tag tag_transparent" data-visibility="gm">${damageFormula} Cold</span></div>
        <ul class="notes">
            <li class="roll-note"><strong>Failure Effect</strong> A creature that fails its save also becomes <a class="content-link" draggable="true" data-link="" data-uuid="Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm" data-id="i3OJZU2nk64Df3xm" data-type="Item" data-pack="pf2e.conditionitems" data-tooltip="Item" data-tooltip-text="Condition Item"><i class="fa-solid fa-face-zany" inert=""></i>Clumsy 1</a> from numbness until the start of your next turn.</li>
        </ul>
    `;

    const concentrateHeatFlavour = `
        <h4 class="action"><strong>Redistribute Potential - Concentrate Heat${isAmpedText}</strong></h4>
        <div class="tags" data-tooltip-class="pf2e"><span class="tag" data-tooltip="PF2E.TraitDescriptionCantrip" data-trait="cantrip">Cantrip</span><span class="tag" data-tooltip="PF2E.TraitDescriptionFire" data-trait="fire">Fire</span><span class="tag" data-tooltip="PF2E.TraitDescriptionConcentrate" data-trait="concentrate">Concentrate</span><span class="tag" data-tooltip="PF2E.TraitDescriptionManipulate" data-trait="manipulate">Manipulate</span><span class="tag" data-tooltip="PF2E.TraitDescriptionOccult" data-trait="occult">Occult</span><span class="tag" data-tooltip="PF2E.TraitDescriptionPsychic" data-trait="psychic">Psychic</span></div>
        <hr>
        <div class="tags modifiers"><span class="tag tag_transparent" data-visibility="gm">${damageFormula} Fire</span></div>
        <ul class="notes">
            <li class="roll-note"><strong>Failure Effect</strong> A creature that fails its save also becomes <a class="content-link" draggable="true" data-link="" data-uuid="Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7" data-id="MIRkyAjyBeXivMa7" data-type="Item" data-pack="pf2e.conditionitems" data-tooltip="Item" data-tooltip-text="Condition Item"><i class="fa-solid fa-face-zany" inert=""></i> Enfeebled 1</a>from heat stroke until the start of your next turn.</li>
        </ul>
    `;

    if (type === "steal-heat") {
        return stealHeatFlavour;
    } else {
        return concentrateHeatFlavour;
    }
}

function getDamageDiceFormula(spellRank: number, isAmped: boolean): string {

    if (isAmped) {
        switch (spellRank) {
            case 5: return "6d6";
            case 6: return "8d6";
            case 7: return "10d6";
            case 8: return "12d6";
            case 9: return "14d6";
            case 10: return "16d6";
        }
    } else {
        switch (spellRank) {
            case 5: return "4d4";
            case 6: return "5d4";
            case 7: return "6d4";
            case 8: return "7d4";
            case 9: return "8d4";
            case 10: return "9d4";
        }
    } 
    
    throw new Error("Invalid spell rank");
    
}

async function sendRolledRollToChat(roll: Roll, flavorText: string, spellItem: SpellPF2e, targetTokens: TokenPF2e[]) {

    const originData = spellItem.getOriginData();
    const targetIds = targetTokens.map(token => token.id);
    replaceTargets(targetIds);

    const spellDamage = await spellItem.getDamage();
    if (!spellDamage) return;

    await roll.toMessage(
        {
            speaker: ChatMessage.getSpeaker(),
            flavor: flavorText,
            flags: {
                pf2e: {
                    context: {
                        ...spellDamage.context,
                        options: Array.from(spellDamage.context.options ?? []),
                    },
                    origin: originData,
                },
                "samioli-module": {
                    isRedistributePotential: true
                }
            },
        },
        { create: true }
    );

}

async function selectLocation(redistributePotentialType: RedistributePotentialType, locationObject: Point, isAmped: boolean): Promise<Point | false> {
    
    let maxLimit: number;
    let minLimit: number;

    const crosshairWidth = isAmped ? 10 : 0;
    const snapPosition = isAmped ? CONST.GRID_SNAPPING_MODES.CORNER : CONST.GRID_SNAPPING_MODES.CENTER;
    const iconTexture = redistributePotentialType === "steal-heat" ? "icons/svg/frozen.svg" : "icons/svg/fire.svg";
    const color = redistributePotentialType === "steal-heat" ? STEAL_HEAT_COLOUR : CONCENTRATE_HEAT_COLOUR;
    
    if (isAmped) {
        maxLimit = redistributePotentialType === "steal-heat" ? 60 : 20;
        minLimit = redistributePotentialType === "steal-heat" ? 0 : 5;
    } else {
        maxLimit = redistributePotentialType === "steal-heat" ? 60 : 5;
        minLimit = redistributePotentialType === "steal-heat" ? 0 : 5;  
    }

    const selectedLocation = await Sequencer.Crosshair.show({
        distance: crosshairWidth,
        fillColor: color,
        location: {
            obj: locationObject,
            limitMaxRange: maxLimit,
            limitMinRange: minLimit,
            wallBehavior: Sequencer.Crosshair.PLACEMENT_RESTRICTIONS.NO_COLLIDABLES,
        },
        icon: {
            texture: iconTexture
        },
        snap: {
            position: snapPosition
        }, 
        gridHighlight: true
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
            ui.notifications.warn("Redistribute potential cancelled.");
            return false;
        },
        show: undefined,
        move: undefined,
        mouseMove: undefined,
        invalidPlacement: undefined,
        placed: undefined
    });
    return selectedLocation;
}

async function createTemplate(templateData: CustomTemplateData): Promise<MeasuredTemplateDocumentPF2e> {

    const myCustomTemplate = await MeasuredTemplateDocument.create(templateData, { parent: canvas.scene });
    if (!myCustomTemplate) {
        throw new Error("Failed to create template");
    }
    return myCustomTemplate as MeasuredTemplateDocumentPF2e;
}

function createCustomTemplateData(location: Point, type: RedistributePotentialType, isAmped: boolean): CustomTemplateData {

    const offset = isAmped ? 0 : canvas.scene!.grid.size / 2;

    const templateShape = isAmped ? "circle" : "rect";
    const templateWidth = isAmped ? 0 : 5;
    const templateDistance = isAmped ? 10 : 7.0710678118654755; // Diagonal for rect template
    const templateDirection = isAmped ? 0 : 45; // Rect templates work on diagonals for a square

    let flagName = "";
    let flagSlug = "";
    let colour = "";
    if (type === "steal-heat") {
        flagName = "Redistribute Potential - Steal Heat";
        flagSlug = "redistribute-potential-steal-heat";
        colour = STEAL_HEAT_COLOUR;
    } else if (type === "concentrate-heat") {
        flagName = "Redistribute Potential - Concentrate Heat";
        flagSlug = "redistribute-potential-concentrate-heat";
        colour = CONCENTRATE_HEAT_COLOUR;
    }

    const templateData: CustomTemplateData = {
        t: templateShape as MeasuredTemplateType,
        x: location.x - (offset),
        y: location.y - (offset),
        width: templateWidth,
        distance: templateDistance,
        direction: templateDirection,
        fillColor: colour as `#${string}`,
        borderColor: colour as `#${string}`,
        flags: {
            pf2e: {
                origin: {
                    name: flagName,
                    slug: flagSlug
                }
            },
            "samioli-module": {
                ignoreTemplateColourOverride: true
            }
        }
    };
    return templateData;
}

function createDamageRoll(value: string, redistributePotentialType: RedistributePotentialType): Roll {

    const damageType = redistributePotentialType === "steal-heat" ? "cold" : "fire";

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll")!;

    const roll = new DamageRoll(`${value}[${damageType}]`);
    return roll;
}