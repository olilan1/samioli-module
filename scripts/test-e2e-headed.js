import { execSync, spawnSync } from 'node:child_process';
import http from 'node:http';

/**
 * Checks if Docker CLI is in PATH and daemon is active.
 */
function verifyDockerEnvironment() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    console.error('\n[ERROR] Docker executable not found on PATH.');
    console.error('Docker Desktop is required to run E2E tests.');
    console.error(
      'Download: https://www.docker.com/products/docker-desktop/\n'
    );
    process.exit(1);
  }

  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    console.error('\n[ERROR] Docker CLI found, but daemon is not running.');
    console.error(
      'Please start Docker Desktop and wait for initialization.\n'
    );
    process.exit(1);
  }
}

/**
 * Polls target URL until HTTP 2xx/3xx response or timeout.
 */
async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isReady = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        const code = res.statusCode ?? 0;
        resolve(code >= 200 && code < 400);
      });
      req.on('error', () => resolve(false));
    });
    if (isReady) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Server at ${url} not ready within ${timeoutMs}ms`);
}

/**
 * Executes E2E headed testing workflow.
 */
async function run() {
  verifyDockerEnvironment();

  console.log('Starting Docker container...');
  execSync('npm run docker:up', { stdio: 'inherit' });

  try {
    console.log(
      'Waiting for Foundry VTT server on http://127.0.0.1:30001...'
    );
    await waitForServer('http://127.0.0.1:30001');

    console.log('Resetting test world state...');
    execSync('npm run test:reset-world', { stdio: 'inherit' });

    console.log('Running Playwright tests in headed mode...');
    spawnSync('npx', ['playwright', 'test', '--headed'], {
      stdio: 'inherit',
      shell: true,
    });
  } finally {
    console.log('Stopping Docker container...');
    execSync('npm run docker:down', { stdio: 'inherit' });
  }
}

run();
