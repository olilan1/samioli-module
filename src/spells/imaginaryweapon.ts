import { ChatMessagePF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";

type DamageType = "bludgeoning" | "slashing";

export async function startImaginaryWeapon(message: ChatMessagePF2e) {

    // check if attack roll is Imaginary Weapon
    const contextOptions = message.flags.pf2e.context?.options;
    if (!contextOptions?.includes("item:imaginary-weapon")) return;

    // determine what type of Imaginary Weapon has been cast
    const isAmped = contextOptions.includes("item:tag:amped");
    let damageType: DamageType;
    if (contextOptions.includes("item:damage:bludgeoning")) {
        damageType = "bludgeoning";
    } else if (contextOptions.includes("item:damage:slashing")) {
        damageType = "slashing";
    } else {
        return;
    }

    // get player who is doing the attack roll and capture targets
    const user = message.author!;
    const caster = message.token!;
    const targets = Array.from(user.targets)
    if (targets.length === 0) return;

    // if player has a different token selected, play animation from that token. Otherwise play from caster.
    const spellDeliverer = canvas.tokens.controlled[0] ?? caster;

    await animateImaginaryWeapon(caster, spellDeliverer, targets, damageType, isAmped);

}

async function animateImaginaryWeapon(caster: TokenDocumentPF2e, spellDeliverer: TokenPF2e, targets: TokenPF2e[], damageType: DamageType, isAmped: boolean) {
    
    let attackAnimation: string;

    if (damageType === "bludgeoning") {
        if (isAmped) {
            attackAnimation = "jb2a.greatclub.fire.pink";
        } else {
            attackAnimation = "jb2a.mace.melee.fire.pink";
        }
    } else if (damageType === "slashing") {
        if (isAmped) {
            attackAnimation = "jb2a.greatsword.melee.fire.pink";
        } else {
            attackAnimation = "jb2a.sword.melee.fire.pink";
        }
    } else return;
    
    const castingAnimation = "jb2a.divine_smite.caster.reversed.purplepink";
    const castingSound = "sound/BG2-Sounds/sco_lgupodd01.wav";
    const hitSound = "sound/BG2-Sounds/scm_hitsmite.wav";

    new Sequence()
        .sound()
            .volume(0.75)
            .file(castingSound)
        .effect()
            .file(castingAnimation)
            .atLocation(caster)
            .scale(0.7)
            .fadeIn(250)
            .fadeOut(500)
        .effect()
            .file(attackAnimation)
            .atLocation(spellDeliverer)
            .spriteScale(1)
            .rotateTowards(targets[0])
            .spriteOffset({ x: -1.5, y: 0 }, { gridUnits: true, local: true })
            .delay(850)
        .sound()
            .volume(0.75)
            .file(hitSound)
    .play()
}