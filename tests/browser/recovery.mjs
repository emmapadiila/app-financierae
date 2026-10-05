// Real-browser integration check. Test data lives only in an isolated Chrome profile.
// Requires Node 22+ and Chrome/Chromium (override path with MFF_BROWSER).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const root = process.cwd();
const cache = resolve(root, 'node_modules/.cache');
const artifacts = resolve(root, 'tests/browser/artifacts/recovery');
await mkdir(cache, { recursive: true });
await mkdir(artifacts, { recursive: true });
const binary = [
  process.env.MFF_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path) => path && existsSync(path));
assert.ok(binary, 'Install Chrome/Chromium or set MFF_BROWSER.');
const url = 'http://127.0.0.1:4183';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4183', '--strictPort'],
  { cwd: root, windowsHide: true, stdio: 'pipe' },
);
let serverOutput = '';
server.stderr.on('data', (chunk) => {
  serverOutput += chunk;
});
let browser;
let socket;
let page;
const runtimeErrors = [];
const checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start(profile) {
  browser = spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const websocket = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    browser.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    browser.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  socket = new WebSocket(websocket);
  await once(socket, 'open');
  const pending = new Map();
  let counter = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown')
      runtimeErrors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      runtimeErrors.push({ consoleError: message.params.args });
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')
      runtimeErrors.push({
        browserError: message.params.entry.text,
        url: message.params.entry.url,
      });
    if (message.id && pending.has(message.id)) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    }
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++counter;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => call(method, params, sessionId);
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await command('Page.navigate', { url });
  return {
    command,
    evaluate: async (expression) => {
      const response = await command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    },
    close: async () => {
      const closed = once(browser, 'exit');
      // Chrome can exit before acknowledging Browser.close over CDP.
      await Promise.race([call('Browser.close'), closed]);
      await closed;
      socket.close();
    },
  };
}
async function waitFor(expression, message = expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await page.evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${message}`);
}
async function click(text) {
  const expression = `(() => { const el = [...document.querySelectorAll('button,a')].find(el => el.innerText.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(text)} || el.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`;
  await waitFor(expression, `Missing control: ${text}`);
  await sleep(80);
}
async function capture(name) {
  await page.evaluate(
    'new Promise(resolve => { window.scrollTo(0,0); requestAnimationFrame(() => requestAnimationFrame(resolve)); })',
  );
  const { cssContentSize } = await page.command('Page.getLayoutMetrics');
  const result = await page.command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
  });
  await writeFile(join(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
}
async function available(expected) {
  await waitFor(
    `document.querySelector('[data-testid="available"]')?.textContent === ${JSON.stringify(expected)}`,
    `available = ${expected}`,
  );
}

async function responsive(name) {
  for (const width of [320, 390, 768, 1280]) {
    await page.command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await sleep(80);
    assert.ok(
      await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
      `${name} overflows at ${width}`,
    );
    await capture(`${name}-${width}`);
  }
  await page.command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

async function route(path, heading) {
  await page.command('Page.navigate', { url: url + path });
  await waitFor(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
}
async function reload() {
  const previous = await page.evaluate('performance.timeOrigin');
  await page.command('Page.reload');
  await waitFor(`performance.timeOrigin !== ${previous} && document.readyState === 'complete'`);
}
async function upload(path) {
  const { root } = await page.command('DOM.getDocument');
  const { nodeId } = await page.command('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'input[type=file]',
  });
  await page.command('DOM.setFileInputFiles', { nodeId, files: [path] });
}

async function readAll() {
  return page.evaluate(`(async () => {
    const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const db = new FinanceDatabase();
    try { return Object.fromEntries(await Promise.all(db.tables.map(async table => [table.name, await table.toArray()]))); }
    finally { db.close(); }
  })()`);
}
async function empty() {
  const records = await readAll();
  assert.equal(Object.keys(records).length, 11);
  for (const rows of Object.values(records)) assert.deepEqual(rows, []);
}
try {
  for (let retry = 0; retry < 100; retry++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Await Vite. */
    }
    await sleep(100);
  }
  const profile = await mkdtemp(join(cache, 'recovery-chrome-'));
  const downloads = await mkdtemp(join(cache, 'recovery-files-'));
  page = await start(profile);
  await waitFor('document.querySelector(".splash")');
  await empty();
  await responsive('splash');
  await page.command('Page.setInterceptFileChooserDialog', { enabled: true });
  await click('Restaurar copia de seguridad');
  const backup = await page.evaluate(`(async () => {
    const { recoveryBackup } = await import('/tests/fixtures/recoveryBackup.ts');
    const backup = recoveryBackup();
    const { localDate } = await import('/src/app/services/financeWorkspace.ts');
    const date = localDate();
    backup.incomes[0].effectiveDate = date;
    backup.expenses[0].dueDate = date;
    backup.debtPayments[0].date = date;
    backup.savingsTransactions[0].date = date;
    backup.transactions[0].date = date;
    backup.budgets[0].month = date.slice(0,7);
    return backup;
  })()`);
  const backupPath = join(downloads, 'respaldo-valido.json');
  await writeFile(backupPath, JSON.stringify(backup));
  for (const [name, contents, message] of [
    ['texto.txt', 'not json', 'JSON válido'],
    ['corrupto.json', '{"version":', 'JSON válido'],
    ['version.json', JSON.stringify({ ...backup, version: 2 }), 'versión'],
    ['esquema.json', JSON.stringify({ ...backup, incomes: [{}] }), 'datos o referencias'],
    ['referencias.json', JSON.stringify({ ...backup, debts: [] }), 'datos o referencias'],
  ]) {
    const path = join(downloads, name);
    await writeFile(path, contents);
    await upload(path);
    await waitFor(
      `document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(message)})`,
    );
    await empty();
    assert.equal(await page.evaluate('Boolean(document.querySelector("dialog[open]"))'), false);
  }
  await responsive('invalid-error');
  await click('Comenzar →');
  await waitFor('location.pathname === "/onboarding"');
  await empty();
  await route('/', 'Mi Familia');
  checks.push(
    'Invalid text, corrupt JSON, schema, version and references keep all 11 stores empty; normal onboarding remains available',
  );
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  assert.ok(
    await page.evaluate(
      'document.querySelector("dialog").textContent.includes("Familia de prueba")',
    ),
  );
  await empty();
  await responsive('preview-light');
  await click('Cancelar');
  await empty();
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await page.evaluate('document.documentElement.dataset.theme="dark"');
  await responsive('preview-dark');
  await page.evaluate('document.documentElement.dataset.theme="light"');
  // Inject one actual IndexedDB write failure, then retry through the same UI.
  await page.evaluate(`(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'budgets') {
        IDBObjectStore.prototype.put = put;
        throw new Error('Fallo de escritura de prueba');
      }
      return put.apply(this, args);
    };
  })()`);
  await click('Restaurar y entrar');
  await waitFor(
    'document.querySelector("dialog [role=alert]")?.textContent.includes("Fallo de escritura de prueba")',
  );
  await empty();
  await capture('restore-error');
  checks.push(
    'Storage failure displays an error and rolls back every store; the same preview permits retry',
  );
  await click('Restaurar y entrar');
  await waitFor('location.pathname === "/dashboard"');
  await available('$850.000');
  const expected = {
    families: [backup.family],
    ...Object.fromEntries(
      Object.entries(backup).filter(
        ([key]) => !['version', 'exportedAt', 'family', 'settings'].includes(key),
      ),
    ),
    settings: [backup.settings],
  };
  assert.deepEqual(await readAll(), expected);
  await capture('restored-dashboard');
  checks.push(
    'Preview and cancel write nothing; confirm restores every collection and enters dashboard without onboarding or reload',
  );
  await route('/transactions', 'Mis movimientos');
  await waitFor(
    'document.body.textContent.includes("Ingreso mensual") && document.body.textContent.includes("Servicios")',
  );
  await capture('restored-movements');
  await route('/debts', 'Mis deudas');
  await waitFor('document.body.textContent.includes("Tarjeta de crédito")');
  await capture('restored-debts');
  await route('/savings', 'Mis metas');
  await waitFor('document.body.textContent.includes("Fondo de emergencia")');
  await capture('restored-savings');
  await reload();
  await waitFor('document.body.textContent.includes("Fondo de emergencia")');
  assert.deepEqual(await readAll(), expected);
  checks.push(
    'Restored movements, debts and savings are visible; reload preserves all collections',
  );
  await route('/more', 'Más herramientas');
  await page.evaluate('document.querySelector("a[href=\\"/backup\\"]").click()');
  await waitFor('location.pathname === "/backup"');
  await page.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await click('📤 Exportar copia de seguridad');
  let exported;
  for (let i = 0; i < 100; i++) {
    exported = (await readdir(downloads)).find(
      (name) => name.startsWith('mi-familia-finanzas-') && name.endsWith('.json'),
    );
    if (exported) break;
    await sleep(100);
  }
  assert.ok(exported);
  assert.deepEqual(
    JSON.parse(await readFile(join(downloads, exported), 'utf8')).family,
    backup.family,
  );
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await click('Cancelar');
  assert.deepEqual(await readAll(), expected);
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await click('Reemplazar datos e importar');
  await waitFor('location.pathname === "/dashboard"');
  await available('$850.000');
  assert.deepEqual(await readAll(), expected);
  checks.push(
    'Existing Backup export, preview, cancel and confirmed replacement remain functional',
  );
  assert.deepEqual(runtimeErrors, []);
  await page.close();
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify({ checks, runtimeErrors, viewports: [320, 390, 768, 1280] }, null, 2),
  );
  console.log(`PASS: ${checks.length} recovery scenarios`);
  checks.forEach((check) => console.log(check));
} catch (error) {
  if (page) {
    try {
      await capture('failure');
      console.error(await page.evaluate('document.body.innerText'));
    } catch {
      /* Preserve failure. */
    }
  }
  throw error;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  server.kill();
}
