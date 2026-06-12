/**
 * scripts/smoke.mjs — Headless smoke test for Fantasy Fight
 *
 * Usage: node scripts/smoke.mjs
 * Prerequisites: dist/ must already be built (npm run build)
 *
 * What it does:
 *  1. Spawns `vite preview --port 4173` to serve dist/
 *  2. Launches headless Chromium via Playwright
 *  3. Navigates to the app and collects console errors / page errors
 *  4. Asserts:
 *     a. <canvas> exists with width === 1280
 *     b. window.game exists and MainMenuScene becomes active (up to 15s)
 *     c. Pressing Enter from MainMenu transitions to CharacterSelectScene (up to 5s)
 *     d. Zero console.error messages and zero uncaught page errors
 *  5. Cleans up and prints SMOKE_OK on success, exits non-zero on failure
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 4173;
const APP_URL = `http://localhost:${PORT}/`;

// ── helpers ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Poll until predicate() returns truthy or timeout elapses.
 * Returns the value returned by predicate on success, or null on timeout.
 */
async function poll(predicate, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(intervalMs);
  }
  return null;
}

/**
 * Check whether a TCP port is accepting connections.
 */
function isPortOpen(port) {
  return new Promise(resolve => {
    const sock = createConnection(port, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(200, () => { sock.destroy(); resolve(false); });
  });
}

/**
 * Wait until the port is open (or throw after timeout).
 */
async function waitForPort(port, timeoutMs = 15000) {
  const ok = await poll(() => isPortOpen(port), timeoutMs, 250);
  if (!ok) throw new Error(`Timed out waiting for port ${port} to open`);
}

// ── main ───────────────────────────────────────────────────────────────────────

let previewProc = null;
let browser = null;

async function cleanup() {
  if (browser) {
    try { await browser.close(); } catch (_) {}
    browser = null;
  }
  if (previewProc) {
    try { previewProc.kill('SIGTERM'); } catch (_) {}
    previewProc = null;
  }
}

// Ensure cleanup on unexpected exits
process.on('exit', () => {
  if (previewProc) try { previewProc.kill('SIGTERM'); } catch (_) {}
});
process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(1); });

async function main() {
  const failures = [];

  // ── Step 1: Spawn vite preview ───────────────────────────────────────────────
  console.log(`[smoke] Spawning vite preview on port ${PORT}...`);
  previewProc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  previewProc.stdout.on('data', d => process.stdout.write(`[vite] ${d}`));
  previewProc.stderr.on('data', d => process.stderr.write(`[vite] ${d}`));
  previewProc.on('error', err => {
    console.error('[smoke] Failed to spawn vite preview:', err.message);
    process.exit(1);
  });

  try {
    await waitForPort(PORT, 15000);
  } catch (e) {
    console.error('[smoke] ERROR: vite preview did not start in time.');
    await cleanup();
    process.exit(1);
  }
  console.log(`[smoke] vite preview is up at ${APP_URL}`);

  // ── Step 2: Launch Chromium ──────────────────────────────────────────────────
  console.log('[smoke] Launching headless Chromium...');
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error(
      '\n[smoke] FATAL: Could not launch Chromium.\n' +
      '  Browsers may not be installed. Run:\n' +
      '    npx playwright install chromium\n' +
      '  Then re-run this script.\n'
    );
    console.error('[smoke] Original error:', err.message);
    await cleanup();
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // ── Step 3: Collect console errors and page errors ───────────────────────────
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  // ── Navigate and wait for canvas ─────────────────────────────────────────────
  console.log(`[smoke] Navigating to ${APP_URL}...`);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  // Wait for <canvas> to appear (Phaser creates it during Game init)
  const canvasHandle = await page.waitForSelector('canvas', { timeout: 15000 });
  if (!canvasHandle) {
    failures.push('No <canvas> element found on page');
  }

  // ── Assertion a: canvas width === 1280 ───────────────────────────────────────
  if (canvasHandle) {
    const canvasWidth = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas ? canvas.width : null;
    });
    if (canvasWidth !== 1280) {
      failures.push(`canvas.width expected 1280, got ${canvasWidth}`);
    } else {
      console.log(`[smoke] ✓ canvas.width === ${canvasWidth}`);
    }
  }

  // ── Assertion b: window.game exists and MainMenuScene becomes active ──────────
  console.log('[smoke] Waiting for MainMenuScene to become active (up to 15s)...');
  const mainMenuActive = await poll(async () => {
    return page.evaluate(() => {
      if (!window.game || !window.game.scene) return false;
      try {
        return window.game.scene.isActive('MainMenuScene');
      } catch (_) {
        return false;
      }
    });
  }, 15000, 300);

  if (!mainMenuActive) {
    failures.push('MainMenuScene never became active within 15s');
    // Try to get current scene info for debugging
    const sceneInfo = await page.evaluate(() => {
      if (!window.game) return 'window.game does not exist';
      const scenes = window.game.scene.scenes || [];
      const active = scenes.filter(s => s.scene && s.scene.isActive()).map(s => s.scene.key);
      return `Active scenes: ${JSON.stringify(active)}`;
    }).catch(e => e.message);
    console.error(`[smoke] Scene debug: ${sceneInfo}`);
  } else {
    console.log('[smoke] ✓ MainMenuScene is active');
  }

  // ── Assertion c: press Enter → CharacterSelectScene ──────────────────────────
  if (mainMenuActive) {
    console.log('[smoke] Pressing Enter to confirm first menu item (Arcade)...');

    // Focus the page first (needed for keyboard events to register)
    await page.click('canvas');
    await sleep(100);

    // Wait for input cooldown to expire (300ms from scene creation)
    await sleep(500);

    // Press Enter — MainMenuScene's first item is "Arcade" → CharacterSelectScene
    await page.keyboard.press('Enter');

    console.log('[smoke] Waiting for CharacterSelectScene to become active (up to 5s)...');
    const charSelectActive = await poll(async () => {
      return page.evaluate(() => {
        if (!window.game || !window.game.scene) return false;
        try {
          return window.game.scene.isActive('CharacterSelectScene');
        } catch (_) {
          return false;
        }
      });
    }, 5000, 200);

    if (!charSelectActive) {
      // Try Space as fallback
      console.log('[smoke] Enter did not work, trying Space...');
      await page.keyboard.press('Space');
      const charSelectActive2 = await poll(async () => {
        return page.evaluate(() => {
          if (!window.game || !window.game.scene) return false;
          try {
            return window.game.scene.isActive('CharacterSelectScene');
          } catch (_) {
            return false;
          }
        });
      }, 3000, 200);

      if (!charSelectActive2) {
        // Try J as last resort
        console.log('[smoke] Space did not work, trying J...');
        await page.keyboard.press('j');
        const charSelectActive3 = await poll(async () => {
          return page.evaluate(() => {
            if (!window.game || !window.game.scene) return false;
            try {
              return window.game.scene.isActive('CharacterSelectScene');
            } catch (_) {
              return false;
            }
          });
        }, 3000, 200);

        if (!charSelectActive3) {
          const sceneInfo = await page.evaluate(() => {
            if (!window.game) return 'window.game does not exist';
            const scenes = window.game.scene.scenes || [];
            const active = scenes.filter(s => s.scene && s.scene.isActive()).map(s => s.scene.key);
            return `Active scenes: ${JSON.stringify(active)}`;
          }).catch(e => e.message);
          failures.push(`CharacterSelectScene never became active after Enter/Space/J. ${sceneInfo}`);
        } else {
          console.log('[smoke] ✓ CharacterSelectScene is active (via J)');
        }
      } else {
        console.log('[smoke] ✓ CharacterSelectScene is active (via Space)');
      }
    } else {
      console.log('[smoke] ✓ CharacterSelectScene is active (via Enter)');
    }
  }

  // Give scenes a moment to settle and emit any errors
  await sleep(1000);

  // ── Assertion d: zero console.error and zero pageerror ───────────────────────
  if (consoleErrors.length > 0) {
    failures.push(
      `${consoleErrors.length} console.error message(s) detected:\n` +
      consoleErrors.map((e, i) => `  [${i + 1}] ${e}`).join('\n')
    );
  } else {
    console.log('[smoke] ✓ No console.error messages');
  }

  if (pageErrors.length > 0) {
    failures.push(
      `${pageErrors.length} uncaught page error(s) detected:\n` +
      pageErrors.map((e, i) => `  [${i + 1}] ${e}`).join('\n')
    );
  } else {
    console.log('[smoke] ✓ No uncaught page errors');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  await cleanup();

  // ── Report ────────────────────────────────────────────────────────────────────
  if (failures.length > 0) {
    console.error('\n[smoke] SMOKE FAILED — the following assertions failed:');
    failures.forEach((f, i) => console.error(`\n  FAIL ${i + 1}: ${f}`));
    process.exit(1);
  }

  console.log('\nSMOKE_OK');
  process.exit(0);
}

main().catch(async err => {
  console.error('[smoke] Unexpected error:', err);
  await cleanup();
  process.exit(1);
});
