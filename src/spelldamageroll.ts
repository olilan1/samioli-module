import { DamageDamageContext, SpellDamageTemplate, SpellPF2e, TokenPF2e } from "foundry-pf2e";

type PF2ETraitKey = keyof typeof CONFIG.PF2E.traitsDescriptions;

interface SpellDamage {  
    template: SpellDamageTemplate;  
    context: DamageDamageContext;  
}  

export async function rollSpellDamage(spellItem: SpellPF2e, targetTokens: TokenPF2e[]) {

    const spellDamage = await spellItem.getDamage();
    if (!spellDamage) return;

    const spellDamageRoll = spellDamage?.template.damage.roll;
    const flavor = await getSpellDamageFlavor(spellDamage);

    spellDamageRoll.toMessage(
        {
            speaker: ChatMessage.getSpeaker(),
            flavor: flavor,
            flags: {
                "pf2e-toolbelt": {
                    targetHelper: {
                        targets: targetTokens.map(t => t.document.uuid)
                    }
                }
            }
        },
        { create: true }
    )
}

async function getSpellDamageFlavor(spellDamage: SpellDamage): Promise<string> {

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
        const modifier = `<span class="tag tag_transparent">${breakdown}</span>`;
        modifiers += modifier;
    }

    return header + traitsHeader + traits + closingDiv + modifiers + closingDiv;
}