const fs = require('fs');
const path = require('path');

async function scanDirectoriesAndExtractData(directories) {
  const database = [];

  for (const directory of directories) {
    await scanDirectory(directory, database);
  }

  return database;
}

async function scanDirectory(directory, database) {
  const files = await fs.promises.readdir(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      await scanDirectory(filePath, database);
    } else if (stats.isFile() && file.endsWith('.json')) {
      await extractDataFromFile(filePath, database);
    }
  }
}

async function extractDataFromFile(filePath, database) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);

    const name = jsonData.name;
    const traits = jsonData.system?.traits?.value;
    const size = jsonData.system?.traits?.size?.value;
    const type = jsonData.type;

    if (name && traits) {
      database.push({ name, traits, size, type });
    }
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err}`);
  }
}

async function main() {
  const directories = ['./pathfinder-bestiary', './pathfinder-bestiary-2', './pathfinder-bestiary-3', './abomination-vaults-bestiary', './age-of-ashes-bestiary', './book-of-the-dead-bestiary', './fists-of-the-ruby-phoenix-bestiary', './howl-of-the-wild-bestiary', './gatewalkers-bestiary'];

  const database = await scanDirectoriesAndExtractData(directories);

  const databaseFilePath = 'database.json';
  await fs.promises.writeFile(databaseFilePath, JSON.stringify(database, null, 2));

  console.log('Database created successfully!');
}

main();
