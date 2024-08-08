import hitSoundsDatabase from "../databases/hit_sounds_database.json" with { type: "json" };

export function onDamageTaken(flags) {
  const myRollOptions = flags.pf2e.rollOptions.all;
  const myTraits = extractTraits(myRollOptions)
  const myBestMatch = findBestMatch(myTraits);
  console.log(myBestMatch);
  const returnedSounds = myBestMatch.files;
  const randomIndex = Math.floor(Math.random() * returnedSounds.length);
  const soundSelected = returnedSounds[randomIndex];
  AudioHelper.play({
      src: soundSelected,
      volume: 0.7,
      autoplay: true,
      loop: false
  }, true);
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