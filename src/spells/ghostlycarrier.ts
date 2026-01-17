import { ActorPF2e, EffectSource, ItemPF2e, SpellPF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-pf2e";
import { getSocket, GHOSTLY_CARRIER_DELETE, GHOSTLY_CARRIER_SUMMON } from "../sockets.ts";
import { addOrUpdateEffectOnActor, delay, moveTokenToPoint } from "../utils.ts";

const GHOSTLY_CARRIER_DATA = {
    name: "Ghostly Carrier",
    type: "npc" as const,
    img: "modules/jb2a_patreon/Library/5th_Level/Arcane_Hand/ArcaneHand_Human_01_Idle_Purple_Thumb.webp" as const,
    folder: "",
    system: {
        attributes: {
            hp: { value: 1, temp: 0, max: 1, details: "" },
            ac: { value: 0, details: "" },
            allSaves: { value: "" },
            speed: {
                value: 120,
                otherSpeeds: [{ type: "fly", value: 120 }],
                details: ""
            }
        },
        initiative: { statistic: "perception" },
        details: {
            level: { value: 1 },
            alliance: "party",
            publication: { title: "", authors: "", license: "OGL", remaster: false }
        },
        abilities: {
            str: { mod: 0 },
            dex: { mod: 0 },
            con: { mod: 0 },
            int: { mod: 0 },
            wis: { mod: 0 },
            cha: { mod: 0 }
        },
        perception: { details: "", mod: 0, senses: [], vision: true },
        saves: {
            fortitude: { value: 0 },
            reflex: { value: 0 },
            will: { value: 0 }
        },
        traits: {
            value: [],
            rarity: "common" as const,
            size: { value: "tiny" as const }
        }
    },
    prototypeToken: {
        name: "Ghostly Carrier",
        height: 0.5,
        width: 0.5,
        actorLink: true,
        texture: {
            src: "modules/jb2a_patreon/Library/5th_Level/Arcane_Hand/ArcaneHand_Human_01_Idle_Purple_400x400.webm" as const,
            scaleX: 1,
            scaleY: 1
        },
        disposition: -1 as const,
        displayBars: 20 as const,
        bar1: { attribute: "attributes.hp" }
    },
    items: [],
    flags: {
        pf2e: { lootable: false }
    },
    ownership: {
    }
};


export async function summonGhostlyCarrier(token: TokenPF2e) {

    if (getGhostlyCarrierItemFromCasterToken(token)) {
        ui.notifications?.warn("Ghostly Carrier is already summoned by this actor.");
        return;
    }

    getSocket().executeAsGM(GHOSTLY_CARRIER_SUMMON, token.document.uuid);
}

export async function summonGhostlyCarrierAsGM(casterTokenUuid: string) {

    const casterTokenDocument = await fromUuid<TokenDocumentPF2e>(casterTokenUuid);
    if (!casterTokenDocument) return;

    const casterActor = casterTokenDocument.actor!;
    
    const folderName = "SamiOli-Module Actors";
    let folder = game.folders.find(f => f.name === folderName && f.type === "Actor");
    if (!folder) {
        folder = await foundry.documents.Folder.create({
            name: folderName,
            type: "Actor"
        });
    }

    const updatedActorData = updateGhostlyCarrierActorData(casterActor, folder!);

    const createdActor = await Actor.create(updatedActorData) as ActorPF2e;
    if (!createdActor) return;

    // Get caster location and add it Ghostly Carrier's TokenDocument
    const x = casterTokenDocument.x;
    const y = casterTokenDocument.y;
    const tokenDocument = await createdActor.getTokenDocument({ x, y }) as TokenDocumentPF2e;

    // Create TokenData so the token can be created on the canvas
    const ghostlyCarrierTokenData = tokenDocument.toObject();

    // So that the Ghostly Carrier token doesn't appear below the caster
    ghostlyCarrierTokenData.sort = casterTokenDocument.sort + 1;
    // Default the token's movement action to fly
    ghostlyCarrierTokenData.movementAction = "fly";
    // Set token to hidden so it will be revealed by the animation
    ghostlyCarrierTokenData.hidden = true;

    // Create the token on the scene from the tokenData
    const [ghostlyCarrierTokenDocument] = await canvas.scene!.createEmbeddedDocuments("Token", [ghostlyCarrierTokenData]);

    // Create the Ghostly Carrier Effect and add UUID to Ghostly Carrier Token
    const ghostlyCarrierEffect = await createAndApplyGhostlyCarrierEffect(casterActor, ghostlyCarrierTokenDocument);
    if (!ghostlyCarrierEffect) return;
    await ghostlyCarrierTokenDocument.setFlag("samioli-module", "ghostlyCarrierEffectUUID", ghostlyCarrierEffect.uuid);

    animateSummoningOfGhostlyCarrier(casterTokenDocument, ghostlyCarrierTokenDocument);
}

function updateGhostlyCarrierActorData(casterActor: ActorPF2e, folder: Folder) {

    let actorDataToUpdate = GHOSTLY_CARRIER_DATA;

    actorDataToUpdate.system.attributes.ac.value = casterActor.attributes.ac?.value ?? 10;
    actorDataToUpdate.system.saves.fortitude.value = casterActor.saves?.fortitude?.mod ?? 0;
    actorDataToUpdate.system.saves.reflex.value = casterActor.saves?.reflex?.mod ?? 0;
    actorDataToUpdate.system.saves.will.value = casterActor.saves?.will?.mod ?? 0;
    actorDataToUpdate.ownership = casterActor.ownership;
    actorDataToUpdate.folder = folder!.id;

    return actorDataToUpdate;
}

async function createAndApplyGhostlyCarrierEffect(casterActor: ActorPF2e, 
    ghostlyCarrierTokenDocument: TokenDocumentPF2e) {

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

export async function deleteGhostlyCarrierTokenOnEffectDeletion(item: ItemPF2e) {
    
    if (item.system.slug !== "samioli-ghostly-carrier") return;
    const tokenUuid = await getGhostlyCarrierTokenUuidFromItem(item);
    if (!tokenUuid) return;

    getSocket().executeAsGM(GHOSTLY_CARRIER_DELETE, tokenUuid);

}

export async function deleteGhostlyCarrierTokenAsGM(tokenUuid: string) {
    
    const tokenDocument = await fromUuid<TokenDocumentPF2e>(tokenUuid);
    if (!tokenDocument) return;
    await cleanUpGhostlyCarrierActor(tokenDocument);
    await tokenDocument.setFlag("samioli-module", "ghostlyCarrierEffectUUID", "");
    await animateAndDeleteGhostlyCarrierToken(tokenDocument);

}

export async function deleteGhostlyCarrierEffectFromCaster(ghostlyCarrierTokenDocument: TokenDocumentPF2e) {
    
    const ghostlyCarrierEffectUuid = ghostlyCarrierTokenDocument.getFlag("samioli-module", "ghostlyCarrierEffectUUID") as string;
    if (!ghostlyCarrierEffectUuid) return;
    const effect = await fromUuid<ItemPF2e>(ghostlyCarrierEffectUuid);
    if (!effect) return;
    await cleanUpGhostlyCarrierActor(ghostlyCarrierTokenDocument);
    await effect.setFlag("samioli-module", "ghostlyCarrierEffectUUID", "");
    await effect.delete();
}

async function cleanUpGhostlyCarrierActor(ghostlyCarrierTokenDocument: TokenDocumentPF2e) {
    
    const actor = ghostlyCarrierTokenDocument.actor;
    if (!actor) return;
    await actor.delete();
    // If no actors remain in the folder, delete the folder
    const folderName = "SamiOli-Module Actors";
    const folder = game.folders.find(f => f.name === folderName && f.type === "Actor");
    if (!folder) return;
    if (folder.contents.length === 0) {
        await folder.delete();
    }
}

export async function moveGhostlyCarrierToCaster(casterToken: TokenPF2e, 
    destinationX: number, destinationY: number) {

    const effect = getGhostlyCarrierItemFromCasterToken(casterToken);
    if (!effect) return;
    const ghostlyCarrierTokenUuuid = await getGhostlyCarrierTokenUuidFromItem(effect)!;
    const ghostlyCarrierToken = (await fromUuid<TokenDocumentPF2e>(ghostlyCarrierTokenUuuid));
    if (!ghostlyCarrierToken) return;

    await delay(300); // simulate a slight lag
    moveTokenToPoint(ghostlyCarrierToken.object!, { x: destinationX, y: destinationY });
}

async function getGhostlyCarrierTokenUuidFromItem(item: ItemPF2e) {

    const tokenDocumentUUID = await item.getFlag("samioli-module", "ghostlyCarrierTokenDocumentUUID") as string;
    return tokenDocumentUUID;
}

function getGhostlyCarrierItemFromCasterToken(casterToken: TokenPF2e) {
    
    return casterToken.actor?.items.find(item => item.slug === "samioli-ghostly-carrier")
}

async function animateSummoningOfGhostlyCarrier(casterTokenDocument: TokenDocumentPF2e, 
    ghostlyCarrierTokenDocument: TokenDocumentPF2e) {
    
    const castingAnimation = `jb2a.magic_signs.circle.02.conjuration.intro.pink`

    const sequence = new Sequence()
        .effect()
            .atLocation(casterTokenDocument)
            .file(castingAnimation)
            .scale(0.5)
        .animation()
            .delay(2700)
            .on(ghostlyCarrierTokenDocument)
            .show()
    sequence.play();
}

async function animateAndDeleteGhostlyCarrierToken(ghostlyCarrierTokenDocument: TokenDocumentPF2e) {

    const desummonAnimation = `jb2a.impact.002.pinkpurple`
    const sequence = new Sequence()
        .effect()
            .atLocation(ghostlyCarrierTokenDocument)
            .file(desummonAnimation)
            .scaleToObject(1.5)
            .waitUntilFinished()
        .thenDo(() => {
            ghostlyCarrierTokenDocument.delete();
        })
    sequence.play();

}