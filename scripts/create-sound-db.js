/**
 * This script generates a JSON database of sound files mapped by sound set and category.
 * 
 * USAGE:
 * Point the `soundDirectory` variable to a folder containing your sound sets.
 * The script expects the following directory structure:
 * 
 * soundDirectory/
 * ├── SoundSetName1/
 * │   ├── Attack/ (contains .wav, .mp3, .ogg, or .m4a files)
 * │   ├── Death/
 * │   └── Hurt/
 * ├── SoundSetName2/
 * │   ├── Attack/
 * │   ├── Death/
 * │   └── Hurt/
 * 
 * Run this script using Node.js: `node create-sound-db.js`
 * It will output a `sounds_db.json` file in the current working directory.
 */
import fs from 'fs';
import path from 'path';

const soundDirectory = 'D:/Programming/Soundsets/Converted/Programming/Soundsets/Ovani';
const modulePrefix = 'modules/pf2e-creature-sounds/sounds/Ovani';

createSoundDatabase();

async function createSoundDatabase() {
    const soundDatabase = {};

    try {
        const soundSets = fs.readdirSync(soundDirectory, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const soundSetName of soundSets) {
            soundDatabase[soundSetName] = {
                display_name: soundSetName,
                notes: "",
                hurt_sounds: [],
                attack_sounds: [],
                death_sounds: [],
                creatures: [],
                keywords: [],
                traits: [],
                size: -1
            };

            const setPath = path.join(soundDirectory, soundSetName);
            const categoryMapping = {
                'Attack': 'attack_sounds',
                'Death': 'death_sounds',
                'Hurt': 'hurt_sounds'
            };

            for (const [subDir, arrayName] of Object.entries(categoryMapping)) {
                const subDirPath = path.join(setPath, subDir);
                
                if (fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()) {
                    const files = fs.readdirSync(subDirPath);
                    
                    for (const file of files) {
                        if (file.match(/\.(wav|mp3|ogg|m4a)$/i)) { // Adjust extensions as needed
                            const fixedPath = `${modulePrefix}/${soundSetName}/${subDir}/${file}`;
                            soundDatabase[soundSetName][arrayName].push(fixedPath);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error reading sound directories:`, error);
    }

    fs.writeFileSync('./sounds_db.json', JSON.stringify(soundDatabase, null, 2));
    console.log('Sound database v3 created successfully!');
}
