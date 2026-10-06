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
const networkHost = process.env.MFF_NETWORK_HOST;
const artifacts = resolve(
  root,
  `tests/browser/artifacts/recurrence-scopes${networkHost ? '-network' : ''}`,
);
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
const url = `http://${networkHost || '127.0.0.1'}:4185`;
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    networkHost || '127.0.0.1',
    '--port',
    '4185',
    '--strictPort',
  ],
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
async function fill(label, value) {
  assert.ok(
    await page.evaluate(`(() => {
    const input = [...document.querySelectorAll('label')].find(el => el.querySelector(':scope > span')?.textContent === ${JSON.stringify(label)})?.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`),
    `Missing field: ${label}`,
  );
  await sleep(80);
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
    await page.evaluate(`document.querySelector('dialog')?.scrollTo(0, 0)`);
    await capture(`${name}-${width}`);
    assert.ok(await page.evaluate(`(() => {
      const dialog = document.querySelector('dialog[open]');
      if (!dialog) return true;
      if (dialog.scrollWidth > dialog.clientWidth) return false;
      const submit = dialog.querySelector('button[type=submit]');
      if (!submit) return false;
      submit.scrollIntoView({ block: 'center' });
      const rect = submit.getBoundingClientRect();
      const bounds = dialog.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    })()`), `${name} action is unreachable at ${width}`);
    if (width === 320) await capture(`${name}-actions-${width}`);
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
  const profile = await mkdtemp(join(cache, 'exceptions-chrome-'));
  const downloads = await mkdtemp(join(cache, 'exceptions-files-'));
  page = await start(profile);
  await waitFor('document.querySelector(".splash")');
  const cryptoCapabilities = await page.evaluate(
    `({ secureContext: isSecureContext, randomUUID: typeof crypto.randomUUID, getRandomValues: typeof crypto.getRandomValues })`,
  );
  if (networkHost) {
    assert.equal(cryptoCapabilities.secureContext, false);
    assert.equal(cryptoCapabilities.randomUUID, 'undefined');
    assert.equal(cryptoCapabilities.getRandomValues, 'function');
  }
  await empty();
  const setup = await page.evaluate(`(async () => {
    const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const { completeOnboarding, localDate } = await import('/src/app/services/financeWorkspace.ts');
    const { addMonthsToMonth, monthRange } = await import('/src/shared/utils/dates.ts');
    const month = localDate().slice(0,7);
    const previous = addMonthsToMonth(month,-1);
    const next = addMonthsToMonth(month,1);
    const db = new FinanceDatabase();
    try {
      const family = await completeOnboarding(db,{income:1000,expenses:[],debts:[],savings:0},previous+'-01');
      return { family: family.id, month, next, date: monthRange(previous).end };
    } finally { db.close(); }
  })()`);
  await waitFor('location.pathname === "/dashboard"');
  await route('/transactions/new?kind=expense', 'Nuevo gasto');
  await fill('Nombre', 'Internet hogar');
  await fill('Valor', '100');
  await fill('Categoría del gasto', 'Hogar');
  await fill('Fecha', setup.date);
  await click('Fijo');
  assert.ok(
    await page.evaluate(
      `(() => { const input = document.querySelector('input[type=checkbox]'); if (!input) return false; input.click(); return input.checked; })()`,
    ),
  );
  await click('Guardar gasto');
  await waitFor('location.pathname === "/transactions"');
  const ids = await page.evaluate(`(async () => {
    const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const { materializeRecurringExpenses } = await import('/src/app/services/financeWorkspace.ts');
    const { createFinanceApplication } = await import('/src/app/services/createFinanceApplication.ts');
    const { family, month, next } = ${JSON.stringify(setup)};
    const db = new FinanceDatabase();
    try {
      const source = (await db.transactions.toArray()).find(t => t.details?.repeatMonthly);
      if (!source) throw new Error('UI did not persist the recurrent series');
      const app = createFinanceApplication(family,db);
      await materializeRecurringExpenses(app,family,next+'-01');
      const movements = await db.transactions.toArray();
      return {family, source:source.id, sourceExpense:source.relatedEntityId, month, next,
        occurrence:movements.find(t=>t.details?.recurrenceSourceId===source.id && t.details.recurrenceMonth===month)};
    } finally { db.close(); }
  })()`);
  await route('/dashboard', 'Así van');
  await available('$900');
  await route('/transactions', 'Mis movimientos');
  await waitFor('document.body.textContent.includes("Internet hogar")');
  await click('Editar Internet hogar');
  await fill('Nombre', 'Internet individual');
  await fill('Valor', '130');
  await click('Guardar cambios');
  await waitFor('!document.querySelector("dialog[open]")');
  await reload();
  await waitFor('document.body.textContent.includes("Internet individual")');
  let records = await readAll();
  assert.equal(records.transactions.find((t) => t.id === ids.occurrence.id).amount, 130);
  assert.equal(records.transactions.find((t) => t.id === ids.source).amount, 100);
  assert.equal(
    records.transactions.find(
      (t) =>
        t.details?.recurrenceSourceId === ids.source && t.details?.recurrenceMonth === ids.next,
    ).amount,
    100,
  );
  checks.push('Single UI edit survives reload without changing the origin or next occurrence');
  await click('Editar Internet individual');
  assert.ok(
    await page.evaluate(
      `(() => { document.querySelector('input[value=following]').click(); return document.querySelector('input[value=following]').checked; })()`,
    ),
  );
  await fill('Nombre', 'Internet desde ahora');
  await fill('Valor', '120');
  await fill('Día mensual', '31');
  await responsive('edit-following');
  await click('Guardar cambios');
  await waitFor('!document.querySelector("dialog[open]")');
  records = await readAll();
  assert.equal(records.transactions.find((t) => t.id === ids.occurrence.id).amount, 120);
  assert.equal(records.transactions.find((t) => t.id === ids.source).amount, 100);
  assert.equal(
    records.transactions.find(
      (t) =>
        t.details?.recurrenceSourceId === ids.source && t.details?.recurrenceMonth === ids.next,
    ).amount,
    120,
  );
  await click('Mes anterior');
  await waitFor('document.body.textContent.includes("Internet hogar")');
  assert.ok(!(await page.evaluate('document.body.textContent.includes("Internet desde ahora")')));
  await click('Mes siguiente');
  await waitFor('document.body.textContent.includes("Internet desde ahora")');
  await click('Mes siguiente');
  await waitFor('document.body.textContent.includes("Internet desde ahora")');
  await click('Mes anterior');
  checks.push(
    'Following edit updates current and later pending occurrences while prior history remains intact',
  );
  await click('Editar Internet desde ahora');
  await click('Eliminar movimiento');
  await waitFor(
    'document.querySelector("dialog").textContent.includes("Ese período no volverá a generarse")',
  );
  await responsive('delete-occurrence');
  await click('Confirmar eliminación');
  await waitFor('!document.querySelector("dialog[open]")');
  await waitFor('!document.body.textContent.includes("Internet desde ahora")');
  const assertOmitted = async () => {
    const records = await readAll();
    assert.ok(!records.expenses.some((e) => e.dueDate.startsWith(ids.month)));
    assert.ok(!records.transactions.some((t) => t.id === ids.occurrence.id));
    assert.deepEqual(records.transactions.find((t) => t.id === ids.source).details.omittedMonths, [
      ids.month,
    ]);
    assert.ok(records.expenses.some((e) => e.id === ids.sourceExpense));
    assert.ok(records.expenses.some((e) => e.dueDate.startsWith(ids.next)));
  };
  await assertOmitted();
  await reload();
  await waitFor('document.querySelector("h1")?.textContent.includes("Mis movimientos")');
  await assertOmitted();
  assert.ok(!(await page.evaluate('document.body.textContent.includes("Internet desde ahora")')));
  await click('Mes siguiente');
  await waitFor('document.body.textContent.includes("Internet desde ahora")');
  await capture('next-occurrence');
  checks.push(
    'UI deletion omits only the current occurrence; reload does not regenerate it and the next month remains visible',
  );
  // Stop from the next month, retaining the origin and the existing omitted month.
  await click('Editar Internet desde ahora');
  await click('Eliminar movimiento');
  await page.evaluate(`document.querySelector('input[value=following]').click()`);
  await responsive('delete-following');
  await click('Confirmar eliminación');
  await waitFor('!document.querySelector("dialog[open]")');
  await waitFor('!document.body.textContent.includes("Internet desde ahora")');
  records = await readAll();
  assert.equal(
    records.transactions.find((t) => t.id === ids.source).details.recurrenceStoppedFrom,
    ids.next,
  );
  assert.ok(!records.expenses.some((e) => e.dueDate.startsWith(ids.next)));
  checks.push(
    'Following deletion stops future generation and removes materialized pending occurrences',
  );
  await route('/dashboard', 'Así van');
  await available('$1.000');
  await route('/transactions', 'Mis movimientos');
  assert.ok(!(await page.evaluate('document.body.textContent.includes("Internet hogar")')));
  await route('/calendar', 'Calendario');
  assert.ok(!(await page.evaluate('document.body.textContent.includes("Internet hogar")')));
  await route('/budget', 'Mi presupuesto');
  assert.equal(
    await page.evaluate('document.querySelectorAll(".budget-summary dd")[1].textContent'),
    '$0',
  );
  await route('/reports', 'Resumen del mes');
  assert.equal(
    await page.evaluate(
      'document.querySelector(".report-comparison .highlight strong").textContent',
    ),
    '$0',
  );
  const assertRules = async () => {
    await page.evaluate(`(async () => {
      const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
      const { createFinanceApplication } = await import('/src/app/services/createFinanceApplication.ts');
      const { materializeRecurringExpenses } = await import('/src/app/services/financeWorkspace.ts');
      const { addMonthsToMonth } = await import('/src/shared/utils/dates.ts');
      const db = new FinanceDatabase();
      try { await materializeRecurringExpenses(createFinanceApplication(${JSON.stringify(ids.family)}, db), ${JSON.stringify(ids.family)}, addMonthsToMonth(${JSON.stringify(ids.next)}, 2) + '-01'); }
      finally { db.close(); }
    })()`);
    const rows = await readAll();
    const rule = rows.transactions.find((t) => t.id === ids.source);
    assert.deepEqual(rule.details.omittedMonths, [ids.month]);
    assert.equal(rule.details.recurrenceStoppedFrom, ids.next);
    assert.equal(rule.details.recurrenceChanges[0].amount, 120);
    assert.ok(rows.expenses.some((e) => e.id === ids.sourceExpense));
    assert.ok(!rows.transactions.some((t) => t.details?.recurrenceSourceId === ids.source));
  };
  await assertRules();
  checks.push(
    'Dashboard, movements, calendar, budget and reports exclude the omitted expense and its metadata',
  );
  await page.close();
  page = await start(profile);
  await waitFor('location.pathname === "/dashboard"');
  await available('$1.000');
  await assertRules();
  checks.push('Full Chrome restart and fresh FinanceSession preserve the exception');
  const secondSource = await page.evaluate(`(async () => {
    const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const { createFinanceApplication } = await import('/src/app/services/createFinanceApplication.ts');
    const { saveMovement, materializeRecurringExpenses } = await import('/src/app/services/financeWorkspace.ts');
    const db = new FinanceDatabase();
    try {
      const app = createFinanceApplication(${JSON.stringify(ids.family)}, db);
      const source = await saveMovement(app, ${JSON.stringify(ids.family)}, {kind:'expense',name:'Electricidad',amount:200,date:${JSON.stringify(setup.date)},category:'Hogar',expenseKind:'fixed',frequency:'occasional',paymentMethod:'cash',note:'',repeatMonthly:true});
      await materializeRecurringExpenses(app, ${JSON.stringify(ids.family)}, ${JSON.stringify(ids.next + '-01')});
      return source.id;
    } finally { db.close(); }
  })()`);
  await route('/transactions', 'Mis movimientos');
  await click('Editar Electricidad');
  await page.evaluate(`document.querySelector('input[value=all]').click()`);
  await fill('Valor', '160');
  await responsive('edit-all');
  await click('Guardar cambios');
  await waitFor('!document.querySelector("dialog[open]")');
  records = await readAll();
  assert.equal(records.transactions.find((t) => t.id === secondSource).amount, 200);
  assert.ok(
    records.transactions
      .filter((t) => t.details?.recurrenceSourceId === secondSource)
      .every((t) => t.amount === 160),
  );
  await click('Editar Electricidad');
  await click('Eliminar movimiento');
  await page.evaluate(`document.querySelector('input[value=all]').click()`);
  await responsive('delete-all');
  await click('Confirmar eliminación');
  await waitFor('!document.querySelector("dialog[open]")');
  await reload();
  await waitFor('document.querySelector("h1")?.textContent.includes("Mis movimientos")');
  records = await readAll();
  assert.equal(records.transactions.find((t) => t.id === secondSource).amount, 200);
  assert.ok(!records.transactions.some((t) => t.details?.recurrenceSourceId === secondSource));
  checks.push(
    'All-series edit and confirmed stop preserve the original history and remove pending current/future charges',
  );
  await route('/backup', 'Tus datos');
  await page.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await click('📤 Exportar copia de seguridad');
  let exported;
  for (let i = 0; i < 100; i++) {
    exported = (await readdir(downloads)).find((name) => name.endsWith('.json'));
    if (exported) break;
    await sleep(100);
  }
  assert.ok(exported);
  const exportedJson = await readFile(join(downloads, exported), 'utf8');
  const backup = JSON.parse(exportedJson);
  // Keep the exact exported bytes outside Chrome's managed download lifecycle.
  const backupPath = join(downloads, 'copia-para-restaurar.json');
  await writeFile(backupPath, exportedJson);
  assert.deepEqual(backup.transactions.find((t) => t.id === ids.source).details.omittedMonths, [
    ids.month,
  ]);
  await page.close();
  page = await start(await mkdtemp(join(cache, 'exceptions-restored-chrome-')));
  await waitFor('document.querySelector(".splash")');
  await empty();
  await page.command('Page.setInterceptFileChooserDialog', { enabled: true });
  await click('Restaurar copia de seguridad');
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await click('Restaurar y entrar');
  await waitFor('location.pathname === "/dashboard"');
  await available('$1.000');
  await assertRules();
  await reload();
  await waitFor('document.querySelector("[data-testid=available]")');
  await available('$1.000');
  await assertRules();
  await route('/transactions', 'Mis movimientos');
  assert.ok(!(await page.evaluate('document.body.textContent.includes("Internet hogar")')));
  await click('Mes siguiente');
  assert.ok(!(await page.evaluate('document.body.textContent.includes("Internet desde ahora")')));
  checks.push(
    'Actual JSON export and Splash restoration into an empty profile preserve exceptions through subsequent materialization',
  );
  assert.deepEqual(runtimeErrors, []);
  await page.close();
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify(
      { url, cryptoCapabilities, checks, runtimeErrors, viewports: [320, 390, 768, 1280] },
      null,
      2,
    ),
  );
  console.log(`PASS: ${checks.length} recurrence scope scenarios`);
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
