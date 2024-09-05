const fs = require('fs');

const creaturesData = JSON.parse(fs.readFileSync('creatures.json', 'utf8'));

const names = [];

for (const creature of creaturesData) {
    //put your traits in here
    if (creature.traits && creature.traits.some(trait => trait.toLowerCase().includes('elemental')) 
        //uncomment below if you want to match multiple traits
        //&& creature.traits.some(trait => trait.toLowerCase().includes('water'))
    ) {
        names.push(creature.name);
    }
}

fs.writeFileSync('names.json', JSON.stringify(names, null, 2));