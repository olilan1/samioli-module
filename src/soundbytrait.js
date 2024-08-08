import hitSoundsDatabase from "../databases/hit_sounds_database.json" with { type: "json" };

const HIT_SOUND_VOLUME = 0.5;

export function onDamageTaken(flags) {
  const rollOptions = flags.pf2e.rollOptions.all;
  const bestMatch = findBestMatch(extractTraits(rollOptions));

  const returnedSounds = bestMatch.files;
  const randomIndex = Math.floor(Math.random() * returnedSounds.length);

  playSound(returnedSounds[randomIndex]);
}

function findBestMatch(traits) {
  let bestMatch = null;
  let maxMatchingTraits = 0;
  for (const entry of hitSoundsDatabase) {
    const matchingTraits = entry.traits.filter(trait => traits.includes(trait)).length;
    if (matchingTraits > maxMatchingTraits) {
      bestMatch = entry;
      maxMatchingTraits = matchingTraits;
    }
  }
  return bestMatch;
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