import soundsDatabase from "../databases/sounds_db.json" with { type: "json" };

const HIT_SOUND_VOLUME = 0.5;

export function onDamageTaken(NPCPF2e) {

  const tokenName = NPCPF2e.name;
  let returnedSounds;

  const soundType = checkIfDamageKills(NPCPF2e);
  //check for name match first
  returnedSounds = findSoundByCreatureName(tokenName, soundType)
  if (returnedSounds) {
    playSound(returnedSounds[Math.floor(Math.random() * returnedSounds.length)]);
  } else {
  //fallback to trait match
    const rollOptions = NPCPF2e.flags.pf2e.rollOptions.all;
    returnedSounds = findSoundByTraits(extractTraits(rollOptions), soundType);
    playSound(returnedSounds[Math.floor(Math.random() * returnedSounds.length)]);
  }
}

function findSoundByCreatureName(creatureName, soundType) {
  for (const [key, value] of Object.entries(soundsDatabase)) {
    if (value.creatures && value.creatures.includes(creatureName)) {
      if (soundType === 'hit') {
        const returnedSounds = value.hit_sounds;
        return returnedSounds;
      }
      else if (soundType === 'death') {
        const returnedSounds = value.death_sounds;
        return returnedSounds;
      }
    }
  }
  return null;
}

function checkIfDamageKills(args){
  if (args.system.attributes.hp.value === 0) {
    return "death"
  } else {
    return "hit"
  }
}


function findSoundByTraits(traits, soundType) {
  let bestMatch = null;
  let maxMatchingTraits = 0;
  for (const [key, value] of Object.entries(soundsDatabase)) {
    const matchingTraits = value.traits.filter(trait => traits.includes(trait)).length;
    if (matchingTraits > maxMatchingTraits) {
      bestMatch = value;
      maxMatchingTraits = matchingTraits;
    }
  }
  if (bestMatch) {
    if (soundType === 'hit') {
      const returnedSounds = bestMatch.hit_sounds;
      return returnedSounds;
    }
    else if (soundType === 'death') {
      const returnedSounds = bestMatch.death_sounds;
      return returnedSounds;
    }
  }
  return null;
}

function extractTraits(obj) {
  const traits = [];
  for (const key in obj) {
    if (key.startsWith("self:trait:")) {
      const trait = key.replace("self:trait:", "");
      traits.push(trait);
    }
  }
  return traits;
}

function playSound(sound) {
  foundry.audio.AudioHelper.play({
    src: sound,
    volume: HIT_SOUND_VOLUME,
    autoplay: true,
    loop: false
  }, true);
}