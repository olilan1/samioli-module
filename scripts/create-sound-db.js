const fs = require('fs');
const path = require('path');

const soundDirectory = '../sounds/GameDevMarket/Humanoid_Creatures_2';

const soundDirectories = findSubdirectories(soundDirectory);

createSoundDatabase();

async function createSoundDatabase() {
    const soundDatabase = {};

    for (const directory of soundDirectories) {
        try {
            const files = fs.readdirSync(directory);

            for (const file of files) {
                if ((file.endsWith('.wav') || file.endsWith('.mp3') || file.endsWith('.ogg') || file.endsWith('.WAV'))) { // Adjust extensions as needed
                    // const regex =  /(\w+)_Monster_([a-zA-Z]+)(\w)*/;  // Evolved_Game_Creatures
                    const regex = /CREAHmn_(.*?)(?=\sAttack|\sDeath|\sPain)\s(Attack|Death|Pain)(.*)/;   // Humanoid Creatures
                    const matches = file.match(regex);
                    
                    if (!matches) {
                        continue;
                    }

                    const soundSetName = matches[1];
                    const soundType = matches[2];

                    if (!soundDatabase[soundSetName]) {
                        soundDatabase[soundSetName] = {
                            notes: "",
                            hurt_sounds: [],
                            attack_sounds: [],
                            death_sounds: [],
                            creatures: [],
                            keywords: [],
                            traits: []
                        };
                    }

                    const fixedPath = fixPath(path.join(directory, file));

                    if (soundType === "Pain") {
                        soundDatabase[soundSetName].hurt_sounds.push(fixedPath);
                    } else if (soundType === 'Attack') {
                        soundDatabase[soundSetName].attack_sounds.push(fixedPath);
                    } else if (soundType === 'Death') {
                        soundDatabase[soundSetName].death_sounds.push(fixedPath);
                    }
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${directory}:`, error);
        }
    }

    fs.writeFileSync('./sounds_db.json', JSON.stringify(soundDatabase, null, 2));
    console.log('Sound database v3 created successfully!');
}

function fixPath(path) {
    return path.replace(/\\/g, "/").replace("..", "modules/samioli-module");
}

function findSubdirectories(directoryPath) {
    const subdirectories = [];
  
    const items = fs.readdirSync(directoryPath);
    for (const item of items) {
      const itemPath = path.join(directoryPath, item);
      const stats = fs.statSync(itemPath);
  
      if (stats.isDirectory())   
   {
        subdirectories.push(itemPath);
        subdirectories.push(...findSubdirectories(itemPath)); // Recursively find subdirectories within subdirectories
      }
    }
  
    return subdirectories;
}
