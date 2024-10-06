/* {"name":"Party Retrieval and Extraction","img":"systems/pf2e/icons/default-icons/party.svg","_id":"0WVdcr2RiAfsFEuc"} */

const PartyActorId = game.actors.party._id;
const PartyMembersActors = Actor.get(PartyActorId).members;
const PartyMembersActorIds = [];

for (let i = 0; i < PartyMembersActors.length; i++) {
    PartyMembersActorIds.push(PartyMembersActors[i]._id);
}

const AllActorsOnCanvasObj = game.canvas.scene.tokens.contents;
const AllActorIdsOnCanvas = [];

for (let i = 0; i < AllActorsOnCanvasObj.length; i++) {
    AllActorIdsOnCanvas.push(AllActorsOnCanvasObj[i].actorId);
}

if (checkIfTokenIsActiveOnScene(PartyActorId)) {
    // if Party Token is active on screen, then extract party members and delete party token
    addPartyMembersAndDeletePartyToken();
} else {
    // if Party token is not active on screen, place Party Actor and delete party members
    addPartyTokenAndRetrievePartyMembers();
}

async function addPartyMembersAndDeletePartyToken() {
    await extractPartyMembers();
    deleteTokenWithActorId(PartyActorId);
}

async function animateExtraction(){

}

async function addPartyTokenAndRetrievePartyMembers() {
    await createActorWithActorId(PartyActorId);
    await animatePartyMembers();
    await delay(500);
    deletePartyMemberTokens();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

function checkIfTokenIsActiveOnScene(id) {
    return AllActorIdsOnCanvas.includes(id);
}

async function deleteTokenWithActorId(actorId) {
    let tokenToDelete = game.canvas.tokens.get(translateActorIdToTokenId(actorId));
    if (!tokenToDelete) {
        console.error(`Token with ActorID ${actorId} not found.`);
        return null;
    }
    tokenToDelete.document.delete();
}

function translateActorIdToTokenId(actorId) {
    const actor = game.canvas.scene.tokens.contents.find(i => i.actorId === actorId);

    if (!actor) {
        console.error(`Actor with ID ${actorId} not found.`);
        return null;
    }

    const tokenId = actor._id;
    return tokenId;
}

async function createActorWithActorId(actorId) {
        const actorImage = Actor.get(actorId).prototypeToken.texture.src;
        const portal = new Portal()
            .addCreature("Actor." + actorId)
            .texture(actorImage);
        await portal.spawn();
        await delay(100);
}


async function extractPartyMembers() {
    for (let i = 0; i < PartyMembersActorIds.length; i++) {
        await createActorWithActorId(PartyMembersActorIds[i]);
    }
}

async function animatePartyMembers() {
    const animationPromises = PartyMembersActorIds.map(actorId =>
        animateTokenMovingToToken(actorId, PartyActorId)
    );
    await Promise.all(animationPromises);
}

async function deletePartyMemberTokens() {
    for (let i = 0; i < PartyMembersActorIds.length; i++) {
        await deleteTokenWithActorId(PartyMembersActorIds[i]);
    }
}

async function checkIfTokenIsAtDestination(tokenPF2eSource, tokenPF2eDestination) {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (tokenPF2eSource.x === tokenPF2eDestination.x && tokenPF2eSource.y === tokenPF2eDestination.y) {
                clearInterval(interval);
                resolve();
            }
        }, 100); // Check every 100ms, you can adjust the interval as needed
    });
}

async function animateTokenMovingToToken(ActorSourceId, ActorDestinationId) {
    let tokenPF2eSource = game.canvas.scene.tokens.find(i => i.actorId === ActorSourceId);
    let tokenPF2eDestination = game.canvas.scene.tokens.find(i => i.actorId === ActorDestinationId);

    if (!tokenPF2eSource || !tokenPF2eDestination) {
        console.error('Source or destination token not found.');
        return;
    }

    let sourcePositionX = tokenPF2eSource.x;
    let sourcePositionY = tokenPF2eSource.y;
    let targetPositionX = tokenPF2eDestination.x;
    let targetPositionY = tokenPF2eDestination.y;

    if (typeof sourcePositionX !== 'number' || typeof sourcePositionY !== 'number' ||
        typeof targetPositionX !== 'number' || typeof targetPositionY !== 'number') {
        console.error('Invalid token positions.');
        return;
    }

    let animationTime = 750

    await new Sequence({ moduleName: "PF2e Animations", softFail: true })
        .animation()
            .on(tokenPF2eSource)
            .moveTowards({ x: targetPositionX, y: targetPositionY })
            .duration(animationTime)
            .waitUntilFinished()
        .animation()
            .on(tokenPF2eSource)
            .opacity(0)
            .waitUntilFinished(100)
        .play();
}