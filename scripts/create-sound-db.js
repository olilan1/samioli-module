const fs = require('fs');
const path = require('path');

const soundDirectory = '..\\sounds\\GameDevMarket';

const soundDirectories = findSubdirectories(soundDirectory)

createSoundDatabase();

async function createSoundDatabase() {
    const soundDatabase = {};

    for (const directory of soundDirectories) {
        try {
            const files = fs.readdirSync(directory);

            for (const file of files) {
                if ((file.endsWith('.wav') || file.endsWith('.mp3') || file.endsWith('.ogg') || file.endsWith('.WAV'))) { // Adjust extensions as needed
                    const fileParts = file.split("_");

                    const soundSetName = fileParts[1];
                    const soundType = fileParts[2];

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

                    if (soundType === "Hurt") {
                        soundDatabase[soundSetName].hurt_sounds.push(path.join(directory, file));
                    } else if (soundType === 'Attack') {
                        soundDatabase[soundSetName].attack_sounds.push(path.join(directory, file));
                    } else if (soundType === 'Death') {
                        soundDatabase[soundSetName].death_sounds.push(path.join(directory, file));
                    }
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${directory}:`, error);
        }
    }

    fs.writeFileSync('./sounds_db_death.json', JSON.stringify(soundDatabase, null, 2));
    console.log('Sound database v3 created successfully!');
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
