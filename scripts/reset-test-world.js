import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const rootDir = path.resolve(dirname, '..');
const testModulesPath = path.join(
  rootDir,
  'tests/fixtures/test-modules.json'
);
const baseWorldJsonPath = path.join(
  rootDir,
  'tests/fixtures/base-test-world/world.json'
);
const dataModulesDir = path.join(rootDir, 'data/Data/modules');
const dataWorldJsonPath = path.join(
  rootDir,
  'data/Data/worlds/playwright-test-world/world.json'
);

const localAppModulesDir = path.join(
  process.env.LOCALAPPDATA || '',
  'FoundryVTT/Data/modules'
);

/**
 * Ensures module folder exists by resolving symlinks and copying real files.
 */
function ensureModuleInstalled(id) {
  if (id === 'samioli-module') return;

  const targetDir = path.join(dataModulesDir, id);
  const exists = fs.existsSync(targetDir);
  if (exists && fs.readdirSync(targetDir).length > 0) {
    return;
  }

  const sourceDir = path.join(localAppModulesDir, id);
  if (fs.existsSync(sourceDir)) {
    const realSource = fs.realpathSync(sourceDir);
    console.log(`Copying module from local Foundry: ${id}...`);
    try {
      fs.cpSync(realSource, targetDir, {
        recursive: true,
        dereference: true,
        filter: (src) => !src.endsWith('LOCK') && !src.endsWith('.lock'),
      });
    } catch (err) {
      console.error(`Failed copying module ${id}: ${err.message}`);
    }
  }
}

/**
 * Injects active module list into world.json manifest.
 */
function updateWorldFile(filePath, modules) {
  if (!fs.existsSync(filePath)) return;
  const rawWorld = fs.readFileSync(filePath, 'utf-8');
  const world = JSON.parse(rawWorld);

  world.relationships = world.relationships || {};
  world.relationships.modules = modules.map((id) => ({
    id,
    type: 'module',
  }));

  fs.writeFileSync(filePath, JSON.stringify(world, null, 2));
}

/**
 * Resets test world manifest and ensures all test modules are installed and enabled.
 */
function resetTestWorld() {
  if (!fs.existsSync(testModulesPath)) {
    throw new Error(`Missing test config at ${testModulesPath}`);
  }

  const rawConfig = fs.readFileSync(testModulesPath, 'utf-8');
  const config = JSON.parse(rawConfig);
  const modules = [
    config.targetModule,
    ...(config.additionalModules || []),
  ];

  fs.mkdirSync(dataModulesDir, { recursive: true });

  for (const id of modules) {
    ensureModuleInstalled(id);
  }

  updateWorldFile(baseWorldJsonPath, modules);
  updateWorldFile(dataWorldJsonPath, modules);

  console.log(`Successfully enabled ${modules.length} modules in world.json`);
}

resetTestWorld();
