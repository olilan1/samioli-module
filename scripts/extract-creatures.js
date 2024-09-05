const fs = require('fs');
const path = require('path');

async function scanDirectoriesAndExtractData(directories) {
  const databaseSet = new Set(); 

  for (const directory of directories) {
    await scanDirectory(directory, databaseSet);
  }

  const database = Array.from(databaseSet).map(JSON.parse); 
  return database;
}

async function scanDirectory(directory, databaseSet) {
  const files = await fs.promises.readdir(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      await scanDirectory(filePath, databaseSet);
    } else if (stats.isFile() && file.endsWith('.json')) {
      await extractDataFromFile(filePath, databaseSet);
    }
  }
}

async function extractDataFromFile(filePath, databaseSet) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);

    const name = jsonData.name;
    const traits = jsonData.system?.traits?.value;
    const size = jsonData.system?.traits?.size?.value;
    const type = jsonData.type;

    if (name && traits) {
      databaseSet.add(JSON.stringify({ name, traits, size, type }));
    }
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err}`);
  }
}

async function main() {
  const directories = [
    './pathfinder-bestiary',
    './pathfinder-bestiary-2',
    './pathfinder-bestiary-3',
    './abomination-vaults-bestiary',
    './age-of-ashes-bestiary',
    './book-of-the-dead-bestiary',
    './fists-of-the-ruby-phoenix-bestiary',
    './howl-of-the-wild-bestiary',
    './gatewalkers-bestiary',
    './pathfinder-monster-core',
  ];

  const database = await scanDirectoriesAndExtractData(directories);

  const databaseFilePath = 'database.json';
  await fs.promises.writeFile(databaseFilePath, JSON.stringify(database, null, 2));

  console.log('Database created successfully!');
}

main();
