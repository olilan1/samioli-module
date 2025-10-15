import { ActorPF2e, EffectSource, ItemPF2e, MeasuredTemplateDocumentPF2e, SpellPF2e } from "foundry-pf2e";
import { addOrUpdateEffectOnActor } from "./utils.ts";

export async function runTemplateHelper(template: MeasuredTemplateDocumentPF2e) {

    const origin = template.flags.pf2e.origin;
    if (!origin) return;

    const actorUuid = origin.actor;
    if (!actorUuid) return;

    const item = origin.uuid ? fromUuidSync(origin.uuid) as ItemPF2e : null;
    if (!item) return;

    // If the item is a sustain spell, ignore it as sustain logic will handle it
    if (isSpellPF2e(item) && item.system.duration.sustained) return;
    // Ignore wall of fire as it has its own delete logic
    // @ts-expect-error slug is valid
    if (template.flags.pf2e?.origin?.slug === 'wall-of-fire') return;

    const actor = fromUuidSync(actorUuid) as ActorPF2e;
    if (!actor) return;

    const effectSource = getTemplateEffectSource(item, template.id);
    const effect = await addOrUpdateEffectOnActor(actor, effectSource);

    template.setFlag("samioli-module", "templateHelperEffectId", effect?.uuid);

}

function isSpellPF2e(item: ItemPF2e | null | undefined): item is SpellPF2e {
    return !!item && item.type === "spell";
}

export function deleteTemplateWhenEffectDeleted(effect: ItemPF2e) {
    const templateId = effect.getFlag("samioli-module", "templateHelperTemplateId") as string | undefined;
    if (!templateId) return;
    const template = game.scenes?.active?.templates.get(templateId);
    if (!template) return;
    template.delete();
}

export function deleteEffectWhenTemplateDeleted(template: MeasuredTemplateDocumentPF2e) {
    const effectId = template.getFlag("samioli-module", "templateHelperEffectId") as string | undefined;
    if (!effectId) return;
    const effect = fromUuidSync(effectId) as ItemPF2e | null;
    if (!effect) return;
    effect.delete();
}

function getTemplateEffectSource(item: ItemPF2e, templateId: string) : EffectSource {

    const effectName = `Template For: ${item.name}`;

    const image = "icons/skills/targeting/crosshair-ringed-gray.webp";
    
    const effect = {
        type: 'effect',
        name: effectName,
        img: image,
        system: {
            tokenIcon: { show: true },
            duration: {
                value: 0,
                unit: "unlimited",
                sustained: false,
                expiry: null
            },
            description: {
                value: `Delete this effect to remove the template for ${item.name}`,
            },
            slug: `template-helper-effect-${item.system.slug}`
        },
        flags: {
            "samioli-module": { 
                templateHelperTemplateId: templateId
            }
        }
    };

    return effect as DeepPartial<EffectSource> as EffectSource;
}