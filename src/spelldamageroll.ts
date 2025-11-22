import { SpellPF2e, TokenPF2e } from "foundry-pf2e";

export type FormulaOverride = {_formula: string, formula: string, originalFormula: string}
type PF2ETraitKey = keyof typeof CONFIG.PF2E.traitsDescriptions;

export async function rollSpellDamage(spellItem: SpellPF2e, targetToken: TokenPF2e, 
    casterToken: TokenPF2e, formulaOverride?: FormulaOverride) {

    const spellDamage = await spellItem.getDamage();
    if (!spellDamage) return;

    const spellDamageRoll = spellDamage?.template.damage.roll;
    let rollFormula = spellDamageRoll._formula;
    let tagFormula = spellDamageRoll.formula;
    let tagOverride = undefined;
    if (formulaOverride) {
        console.log("formulaOverride", formulaOverride);
        rollFormula = formulaOverride._formula;
        tagFormula = formulaOverride.formula;
        tagOverride = {override: tagFormula, original: formulaOverride.originalFormula};
    }
    const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll")!;
    const roll = new DamageRoll(rollFormula, casterToken.actor?.getRollData())
    const originData = spellItem.getOriginData();
    const validModifers = await getEnabledSpellDamageModifiers(spellItem);
    const flavor = await getSpellDamageFlavor(spellItem, tagOverride);

    const spellDamageContext = {
        type: "damage-roll",
        sourceType: "save",
        actor: casterToken.actor?.id,
        token: casterToken.id,
        target: targetToken.id,
        domains: spellDamage.context.domains, 
        options: Array.from(spellDamage.context.options ?? []),
        secret: false,
        rollMode: spellDamage.context.rollMode,
        traits: spellDamage.context.traits,
        skipDialog: true,
        outcome: spellDamage.context.outcome, 
        unadjustedOutcome: spellDamage.context.unadjustedOutcome,
    }

    roll.toMessage(
        {
            speaker: ChatMessage.getSpeaker(),
            flavor: flavor,
            flags: {
                pf2e: {
                    context: spellDamageContext,
                    modifiers: validModifers,
                    origin: originData,
                },
                "pf2e-toolbelt": {
                    targetHelper: {
                        targets: [targetToken.document.uuid]
                    }
                }
            }
        },
        { create: true }
    )
}

async function getEnabledSpellDamageModifiers(spellItem: SpellPF2e) {

    const spellDamage = await spellItem.getDamage();
    const modifiers = spellDamage?.template.modifiers;
    const validModifers = [];
    if (!modifiers || modifiers.length === 0) return;
    for (const modifier of modifiers) {
        if (modifier.enabled) {
            validModifers.push(modifier);
        }
    }
    return validModifers;

}

async function getSpellDamageFlavor(spellItem: SpellPF2e, tagOverride?: {override: string, original: string}): Promise<string> {

    const spellDamage = await spellItem.getDamage();
    if (!spellDamage) return ``;

    const header = `
        <h4 class="action">
        <strong>${spellDamage.template.name}</strong>
        </h4>
    `;

    const traitsHeader = `<div class="tags" data-tooltip-class="pf2e">`;

    const traits = (spellDamage.context.traits ?? []).map((tag: string) => {
        const traitKey = tag as PF2ETraitKey; 

        const label = game.i18n.localize(
            CONFIG.PF2E.actionTraits[traitKey as keyof typeof CONFIG.PF2E.actionTraits] ??
            CONFIG.PF2E.featTraits[traitKey as keyof typeof CONFIG.PF2E.featTraits] ??
            tag
        );
        const tooltip = CONFIG.PF2E.traitsDescriptions[traitKey];

        return `<span class="tag" data-trait="${tag}" data-tooltip="${tooltip}">${label}</span>`;
    }).join('');

    let modifiers = `
        <hr />
            <div class="tags modifiers">
    `

    const closingDiv = `</div>`;

    const damageBreakdowns = spellDamage.template.damage.breakdown;

    for (const breakdown of damageBreakdowns) {
        let override = breakdown;
        if (tagOverride?.original === breakdown) {
            override = tagOverride.override;
        }
        const modifier = `<span class="tag tag_transparent">${override}</span>`;
        modifiers += modifier;
    }

    return header + traitsHeader + traits + closingDiv + modifiers + closingDiv;
}