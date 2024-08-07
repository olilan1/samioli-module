import hitSoundsDatabase from "../databases/hit_sounds_database.json" with { type: "json" };

export function findBestMatch(traits) {
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

export function extractTraits(obj) {
    const traits = [];
  
    for (const key in obj) {
      if (key.startsWith("self:trait:")) {
        const trait = key.replace("self:trait:", "");
        traits.push(trait);
      }
    }
  
    return traits;
  }