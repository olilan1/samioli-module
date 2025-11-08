import { ChatMessagePF2e, ItemPF2e, MeasuredTemplateDocumentPF2e, SpellPF2e, TokenPF2e } from "foundry-pf2e";
import { logd } from "../utils.ts";
import { CrosshairUpdatable } from "../types.ts";
import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";
import { getTemplateTokens, replaceTargets } from "../templatetarget.ts";

type CustomTemplateData = {
    t: MeasuredTemplateType;
    x: number;
    y: number;
    width: number;
    distance: number;
    direction: number;
    fillColor: `#${string}`;
    borderColor: `#${string}`;
    flags?: { [x: string]: { [x: string]: JSONValue } };
    [key: string]: JSONValue | undefined; 
};

type RedistributePotentialTypes = "steal-heat" | "concentrate-heat";

export async function startRedistributePotential(token: TokenPF2e, message: ChatMessagePF2e) {

    // Check if spell is amped or not
    if (!message.flags.pf2e?.context?.options) return;
    const isAmped = message.flags.pf2e?.context?.options.includes("amp-spell");

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
    if (!concentrateHeatTemplateData) return;
    const concentrateHeatTemplate = await createTemplate(concentrateHeatTemplateData);
    const concentrateHeatTargetTokens = await getTemplateTokens(concentrateHeatTemplate);

    // Clean up templates
    stealHeatTemplate.delete();
    concentrateHeatTemplate.delete();

    // Capture additional context for the spell damage message
    const redistributePotentialItem = getRedistributePotentialItemToken(token) as SpellPF2e;
    if (!redistributePotentialItem) {
        logd(`Could not find Redistribute Potential item on actor ${token.name}.`);
        return;
    }

    const spellRank = message.flags.pf2e.context.options.find((opt: string) => opt.startsWith("item:rank:"))?.replace("item:rank:", "") as "5" | "6" | "7" | "8" | "9" | "10";
    const damageFormula = getDamageDiceFormula(spellRank, isAmped);
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

    // Roll Steal Heat damage but don't send message yet
    const stealHeatDamageRoll = rollDamage(damageFormula, "steal-heat");
    if (!stealHeatDamageRoll) return;
    const evaluatedStealHeatDamageRoll = await stealHeatDamageRoll.evaluate();
    const stealHeatDamageTotal = evaluatedStealHeatDamageRoll.total;

    await sendRolledRollToChat(evaluatedStealHeatDamageRoll, stealHeatFlavour, redistributePotentialItem, stealHeatTargetTokens);

    // Roll Concentrate Heat damage but don't send message yet (use the same damage total as Steal Heat)
    const concentrateHeatDamageRoll = rollDamage(stealHeatDamageTotal.toString(), "concentrate-heat");
    if (!concentrateHeatDamageRoll) return;

    await sendRolledRollToChat(concentrateHeatDamageRoll, concentrateHeatFlavour, redistributePotentialItem, concentrateHeatTargetTokens);

}

function getDamageDiceFormula(spellRank: "5" | "6" | "7" | "8" | "9" | "10", isAmped: boolean): string {

    if (isAmped) {
        switch (spellRank) {
            case "5": return "6d6";
            case "6": return "8d6";
            case "7": return "10d6";
            case "8": return "12d6";
            case "9": return "14d6";
            case "10": return "16d6";
        }
    } else {
        switch (spellRank) {
            case "5": return "4d4";
            case "6": return "5d4";
            case "7": return "6d4";
            case "8": return "7d4";
            case "9": return "8d4";
            case "10": return "9d4";
        }
    }
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
            content: `hello`,
            flags: {
                pf2e: {
                    context: {
                        ...spellDamage.context,
                        options: Array.from(spellDamage.context.options ?? []),
                    },
                    origin: originData,
                },
            },
        },
        { create: true }
    );

}

async function selectLocation(redistributePotentialType: RedistributePotentialTypes, locationObject: Point | TokenPF2e, isAmped: boolean): Promise<Point | false> {
    
    let maxLimit: number;
    let minLimit: number;

    const crosshairWidth = isAmped ? 10 : 0;
    const snapPosition = isAmped ? CONST.GRID_SNAPPING_MODES.CORNER : CONST.GRID_SNAPPING_MODES.CENTER;
    const iconTexture = redistributePotentialType === "steal-heat" ? "icons/svg/frozen.svg" : "icons/svg/fire.svg";
    const color = redistributePotentialType === "steal-heat" ? "#4134d4" : "#f59042";
    
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

function createCustomTemplateData(location: Point, type: RedistributePotentialTypes, isAmped: boolean): CustomTemplateData | null {

    if (canvas.scene === undefined || canvas.scene === null) return null;
    const offset = isAmped ? 0 : canvas.scene?.grid.size / 2;

    const canvasGridSize = canvas.scene.grid.size;
    if (!canvasGridSize) return null;

    const templateShape = isAmped ? "circle" : "rect";
    const templateWidth = isAmped ? 0 : 5;
    const templateDistance = isAmped ? 10 : 7.0710678118654755;
    const templateDirection = isAmped ? 0 : 45;

    let flagName = "";
    let flagSlug = "";
    let color = "";
    if (type === "steal-heat") {
        flagName = "Redistribute Potential - Steal Heat";
        flagSlug = "redistribute-potential-steal-heat";
        color = "#4134d4";
    } else if (type === "concentrate-heat") {
        flagName = "Redistribute Potential - Concentrate Heat";
        flagSlug = "redistribute-potential-concentrate-heat";
        color = "#f59042";
    }

    const templateData: CustomTemplateData = {
        t: templateShape as MeasuredTemplateType,
        x: location.x - (offset),
        y: location.y - (offset),
        width: templateWidth,
        distance: templateDistance,
        direction: templateDirection,
        fillColor: color as `#${string}`,
        borderColor: color as `#${string}`,
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

function rollDamage(value: string, redistributePotentialType: RedistributePotentialTypes): Roll | null {

    const damageType = redistributePotentialType === "steal-heat" ? "cold" : "fire";

    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
    if (!DamageRoll) return null;

    const roll = new DamageRoll(`${value}[${damageType}]`);
    return roll;
}

function getRedistributePotentialItemToken(token: TokenPF2e): ItemPF2e | null {
    if (!token.actor) return null;
    const redistributePotentialItem = token.actor.items.find(i => i.slug === "redistribute-potential");
    if (!redistributePotentialItem) return null;
    return redistributePotentialItem;
}