import { ActorPF2e, EffectSource, ItemPF2e, SpellPF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { getSocket, GHOSTLY_CARRIER_DELETE, GHOSTLY_CARRIER_SUMMON } from "../sockets.ts";
import { addOrUpdateEffectOnActor, delay, moveTokenToPoint } from "../utils.ts";

export async function summonGhostlyCarrier(token: TokenPF2e) {

    if (getGhostlyCarrierItemFromToken(token)) {
        ui.notifications?.warn("Ghostly Carrier is already summoned by this actor.");
        return;
    }

    getSocket().executeAsGM(GHOSTLY_CARRIER_SUMMON, token.document.uuid);
}

export async function summonGhostlyCarrierAsGM(casterTokenUuid: string) {

    const casterTokenDocument = await fromUuid<TokenDocumentPF2e>(casterTokenUuid);
    if (!casterTokenDocument) return;

    const casterActor = casterTokenDocument.actor!;

    const actorName = "Ghostly Carrier";
    const packName = "samioli-module.Actors";

    const pack = game.packs.get(packName)!;
    await pack.getIndex();
    const entry = pack.index.find((i) => i.name === actorName)!;
    const actorData = await fromUuid(entry.uuid) as ActorPF2e<null>;
    const actorToCreate = game.actors.fromCompendium(actorData);
    
    const folderName = "SamiOli-Module Actors";

    let folder = game.folders.find(f => f.name === folderName && f.type === "Actor");

    if (!folder) {
        // @ts-expect-error Folder.create is valid
        folder = await foundry.documents.Folder.create({
            name: folderName,
            type: "Actor"
        });
    }

    actorToCreate.folder = folder!.id;

    const createdActor = await Actor.create(actorToCreate)!;
    if (!createdActor) return;

    const updateData = {
        // Update Attributes and Saves to match caster
        "system.attributes.ac.value": casterActor.attributes?.ac?.value ?? 10,
        "system.saves.fortitude.value": casterActor.saves?.fortitude?.mod ?? 0,
        "system.saves.reflex.value": casterActor.saves?.reflex?.mod ?? 0,
        "system.saves.will.value": casterActor.saves?.will?.mod ?? 0,
        // set ownership to match caster
        ownership: casterActor.ownership
    };

    await createdActor.update(updateData);

    // Get caster location and add it Ghostly Carrier TokenDocument
    const x = casterTokenDocument.x;
    const y = casterTokenDocument.y;
    const tokenDocument = await createdActor.getTokenDocument({ x, y }) as TokenDocumentPF2e;

    // Create TokenData so the token can be created on the canvas
    const ghostlyCarrierTokenData = tokenDocument.toObject();

    // So that the Ghostly Carrier token doesn't appear below the caster
    const sort = casterTokenDocument.sort
    ghostlyCarrierTokenData.sort = sort + 1;
    // Default the token's movement action to fly
    ghostlyCarrierTokenData.movementAction = "fly";
    // Set token to hidden so it will be revealed by the animation
    ghostlyCarrierTokenData.hidden = true;

    // Create the token on the scene from the tokenData
    const [ghostlyCarrierTokenDocument] = await canvas.scene!.createEmbeddedDocuments("Token", [ghostlyCarrierTokenData]);

    // Create the Ghostly Carrier Effect and add UUID to Ghostly Carrier Token
    const ghostlyCarrierEffect = await createAndApplyGhostlyCarrierEffect(casterActor, ghostlyCarrierTokenDocument);
    if (!ghostlyCarrierEffect) return;
    await ghostlyCarrierTokenDocument.setFlag("samioli-module", "ghostlyCarrierEffectUUID", ghostlyCarrierEffect.uuid)

    animateSummoningOfGhostlyCarrier(casterTokenDocument, ghostlyCarrierTokenDocument)
}

async function createAndApplyGhostlyCarrierEffect(casterActor: ActorPF2e, ghostlyCarrierTokenDocument: TokenDocumentPF2e) {

    const ghostlyCarrierSpell = casterActor.items.find(item => item.type === "spell"
        && item.system.slug === "ghostly-carrier") as SpellPF2e;

    const ghostlyCarrierEffectData = {
        name: `Summoning a Ghostly Carrier`,
        type: "effect",
        img: ghostlyCarrierSpell.img,
        system: {
            slug: "samioli-ghostly-carrier",
            description: {
                value: ghostlyCarrierSpell.system.description.value
            },
            duration: {
                value: 10,
                unit: "rounds"
            },
            tokenIcon: {
                show: true
            }
        },
        flags: {
            ["samioli-module"]: {
                ghostlyCarrierTokenDocumentUUID: ghostlyCarrierTokenDocument.uuid
            }
        }
    } as DeepPartial<EffectSource> as EffectSource;

    return await addOrUpdateEffectOnActor(casterActor, ghostlyCarrierEffectData);

}

export async function deleteGhostlyCarrierTokenFromEffect(item: ItemPF2e) {
    
    if (item.system.slug !== "samioli-ghostly-carrier") return;
    const tokenDocument = await getGhostlyCarrierTokenDocumentFromItem(item);
    if (!tokenDocument) return;

    getSocket().executeAsGM(GHOSTLY_CARRIER_DELETE, tokenDocument.uuid);

}

export async function deleteGhostlyCarrierTokenAsGM(tokenUuid: string) {
    
    const tokenDocument = await fromUuid<TokenDocumentPF2e>(tokenUuid);
    if (!tokenDocument) return;
    await cleanUpGhostlyCarrierActor(tokenDocument);
    await tokenDocument.setFlag("samioli-module", "ghostlyCarrierEffectUUID", "");
    await animateAndDeleteGhostlyCarrierToken(tokenDocument);

}

export async function deleteGhostlyCarrierEffectFromToken(token: TokenDocumentPF2e) {
    
    const ghostlyCarrierEffectUuid = token.getFlag("samioli-module", "ghostlyCarrierEffectUUID") as string;
    if (!ghostlyCarrierEffectUuid) return;
    const effect = fromUuidSync(ghostlyCarrierEffectUuid);
    if (!effect) return;
    await cleanUpGhostlyCarrierActor(token);
    await effect.setFlag("samioli-module", "ghostlyCarrierEffectUUID", "");
    await effect.delete();
}

async function cleanUpGhostlyCarrierActor(ghostlyCarrierTokenDocument: TokenDocumentPF2e) {
    
    const actor = ghostlyCarrierTokenDocument.actor;
    if (!actor) return;
    actor.delete();
}

export async function moveGhostlyCarrierToCaster(casterToken: TokenPF2e, 
    destinationX: number, destinationY: number) {

    const effect = getGhostlyCarrierItemFromToken(casterToken);
    if (!effect) return;
    const ghostlyCarrierToken = (await getGhostlyCarrierTokenDocumentFromItem(effect))!.object;
    if (!ghostlyCarrierToken) return;

    await delay(300); // simulate a slight lag
    moveTokenToPoint(ghostlyCarrierToken, { x: destinationX, y: destinationY });
}

async function getGhostlyCarrierTokenDocumentFromItem(item: ItemPF2e) {

    const tokenDocumentUUID = await item.getFlag("samioli-module", "ghostlyCarrierTokenDocumentUUID") as string;
    if (!tokenDocumentUUID) return;
    const tokenDocument = await fromUuid(tokenDocumentUUID) as TokenDocumentPF2e;
    return tokenDocument;
}

function getGhostlyCarrierItemFromToken(casterToken: TokenPF2e) {
    
    return casterToken.actor?.items.find(item => item.slug === "samioli-ghostly-carrier")
}

async function animateSummoningOfGhostlyCarrier(casterToken: TokenDocumentPF2e, ghostlyCarrierToken: TokenDocumentPF2e) {
    
    const castingAnimation = `jb2a.magic_signs.circle.02.conjuration.intro.pink`

    const sequence = new Sequence()
        .effect()
            .atLocation(casterToken)
            .file(castingAnimation)
            .scale(0.5)
        .animation()
            .delay(2700)
            .on(ghostlyCarrierToken)
            .show()
    sequence.play();
}

async function animateAndDeleteGhostlyCarrierToken(ghostlyCarrierToken: TokenDocumentPF2e) {

    const desummonAnimation = `jb2a.impact.002.pinkpurple`
    const sequence = new Sequence()
        .effect()
            .atLocation(ghostlyCarrierToken)
            .file(desummonAnimation)
            .scaleToObject(1.5)
            .waitUntilFinished()
        .thenDo(() => {
            ghostlyCarrierToken.delete();
        })
    sequence.play();

}