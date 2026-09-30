// Real-browser integration check. Test data lives only in an isolated Chrome profile.
// Requires Node 22+ and Chrome/Chromium (override path with MFF_BROWSER).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const root = process.cwd();
const cache = resolve(root, 'node_modules/.cache');
const artifacts = resolve(root, 'tests/browser/artifacts/block-c');
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
const url = 'http://127.0.0.1:4181';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4181', '--strictPort'],
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
async function fill(label, value) {
  assert.ok(
    await page.evaluate(
      `(() => { const label = [...document.querySelectorAll('label')].find(el => el.querySelector(':scope > span')?.textContent === ${JSON.stringify(label)}); const input = label?.querySelector('input'); if (!input) return false; input.focus(); input.select(); return true; })()`,
    ),
    `Missing field: ${label}`,
  );
  await page.command('Input.insertText', { text: value });
  await sleep(60);
}
async function capture(name) {
  await page.evaluate('window.scrollTo(0,0)');
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
  for (const width of [320, 390, 430, 768, 1280]) {
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
    if (width === 320 || width === 390 || width === 1280) await capture(`${name}-${width}`);
  }
  await page.command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

async function total(expected) {
  await waitFor(
    `document.querySelector('[data-testid="debt-total"]')?.textContent === ${JSON.stringify(expected)}`,
  );
}
async function addDebt(name, amount, minimum, rate = '0') {
  await click('+ Agregar deuda');
  for (const [label, value] of [
    ['Nombre de la deuda', name],
    ['Acreedor', 'Proveedor de prueba'],
    ['Monto original', amount],
    ['Saldo pendiente', amount],
    ['Cuota mínima mensual', minimum],
    ['Tasa de interés anual (%)', rate],
    ['Día de vencimiento', '12'],
  ])
    await fill(label, value);
  await click('Guardar deuda');
  await waitFor('!document.querySelector("dialog[open]")');
}
async function verifyProjection() {
  const expected = await page.evaluate(`(async () => {
    const { FinanceDatabase } = await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const { createFinanceApplication } = await import('/src/app/services/createFinanceApplication.ts');
    const { findFamily, loadWorkspace } = await import('/src/app/services/financeWorkspace.ts');
    const { debtPlanView } = await import('/src/app/services/debtViews.ts');
    const db = new FinanceDatabase();
    try { const family = await findFamily(db); const app = createFinanceApplication(family.id, db); const data = await loadWorkspace(app, family.id); const view = debtPlanView(data, app.calculators); return { months: view.plan.estimatedMonths, priority: data.debts.find(debt => debt.id === view.timeline[0].priorityId).name }; } finally { db.close(); }
  })()`);
  await waitFor(
    `document.querySelector('[data-testid="plan-months"]')?.textContent === '${expected.months} ${expected.months === 1 ? 'mes' : 'meses'}'`,
  );
  assert.ok(
    await page.evaluate(
      `document.querySelector('.debt-timeline > li').textContent.includes(${JSON.stringify(expected.priority)})`,
    ),
  );
  return expected;
}

try {
  for (let retry = 0; retry < 100; retry++) {
    if (server.exitCode !== null) throw new Error(`Vite failed: ${serverOutput}`);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait for Vite. */
    }
    if (retry === 99) throw new Error('Vite startup timed out');
    await sleep(100);
  }
  const profile = await mkdtemp(join(cache, 'block-c-chrome-'));
  page = await start(profile);
  await waitFor('document.querySelector(".splash")');
  await click('Comenzar →');
  await click('Por ahora no tengo ingresos');
  await click('Continuar');
  await click('Continuar');
  await click('No tengo ¡Qué bien!');
  await click('Continuar');
  await click('Por ahora no reservaré dinero');
  await click('Guardar y ver resumen');
  await waitFor('location.pathname === "/onboarding/summary"');
  await click('Ir a mi Dashboard');
  await available('$0');
  await click('Deudas');
  await total('$0');
  assert.ok(
    await page.evaluate('document.body.textContent.includes("No tienes deudas registradas.")'),
  );
  await click('Plan');
  assert.ok(
    await page.evaluate('document.body.textContent.includes("No tienes deudas registradas.")'),
  );
  await click('Deudas');
  await addDebt('Equipo propio', '81000', '9000');
  await addDebt('Financiación del taller', '245000', '14000', '24');
  await total('$326.000');
  assert.equal(
    await page.evaluate('document.querySelector(".bottom-nav .active").textContent'),
    'Deudas',
  );
  await responsive('debts');
  checks.push('Empty states and real debt creation, totals and five responsive sizes');
  await click('Plan');
  const before = await verifyProjection();
  await click('Deudas');
  await click('Registrar pago de Equipo propio');
  await waitFor('location.pathname === "/transactions/new"');
  assert.equal(
    await page.evaluate('document.querySelector("select").selectedOptions[0].textContent'),
    'Equipo propio',
  );
  await fill('Valor', '18000');
  await click('Guardar pago');
  await waitFor('location.pathname === "/debts"');
  await total('$308.000');
  await click('Ver detalle de Equipo propio');
  assert.ok(
    await page.evaluate('document.querySelector("dialog").textContent.includes("$18.000")'),
  );
  await capture('debt-detail');
  await click('Cerrar formulario');
  await click('Plan');
  const after = await verifyProjection();
  assert.ok(after.months <= before.months);
  assert.equal(
    await page.evaluate('document.querySelector(".bottom-nav .active").textContent'),
    'Plan',
  );
  checks.push(
    'Existing payment flow preselects debt, returns to debts and updates detail and projection',
  );
  await click('Bola de nieve');
  await waitFor(
    'document.querySelector(".strategy-card[aria-pressed=true]")?.getAttribute("aria-label") === "Bola de nieve"',
  );
  assert.equal((await verifyProjection()).priority, 'Equipo propio');
  await responsive('snowball');
  await click('Avalancha');
  await waitFor(
    'document.querySelector(".strategy-card[aria-pressed=true]")?.getAttribute("aria-label") === "Avalancha"',
  );
  assert.equal((await verifyProjection()).priority, 'Financiación del taller');
  await click('Personalizado');
  await waitFor('document.querySelector(".custom-debt-order")');
  const secondName = await page.evaluate(
    'document.querySelectorAll(".custom-debt-order li span")[1].textContent.slice(3)',
  );
  await click(`Subir ${secondName}`);
  await waitFor(
    `document.querySelector('.custom-debt-order li span').textContent.includes(${JSON.stringify(secondName)})`,
  );
  assert.equal((await verifyProjection()).priority, secondName);
  await responsive('custom-plan');
  await page.command('Page.reload');
  await waitFor('document.querySelector(".custom-debt-order")');
  assert.equal((await verifyProjection()).priority, secondName);
  await page.close();
  page = await start(profile);
  await waitFor('location.pathname === "/dashboard"');
  await click('Deudas');
  await total('$308.000');
  await click('Plan');
  assert.equal((await verifyProjection()).priority, secondName);
  checks.push(
    'Snowball, avalanche and reordered custom plan match DebtPlanner and survive reload/restart',
  );
  await click('Deudas');
  await click('Registrar pago de Equipo propio');
  await fill('Valor', '63000');
  await click('Guardar pago');
  await waitFor('location.pathname === "/debts"');
  await total('$245.000');
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll('a')].some(link => link.getAttribute('aria-label') === 'Registrar pago de Equipo propio')`,
    ),
    false,
  );
  assert.ok(
    await page.evaluate(
      'document.querySelector(".debt-total").textContent.includes("1 deuda activa")',
    ),
  );
  await click('Plan');
  await verifyProjection();
  assert.equal(await page.evaluate('document.querySelectorAll(".custom-debt-order li").length'), 1);
  checks.push(
    'Settled debt stays visible, loses payment action and is excluded from active custom plan',
  );
  await click('Deudas');
  await addDebt('Saldo con intereses elevados', '1000000', '1', '120');
  await click('Plan');
  await waitFor('document.body.textContent.includes("No podemos estimar una fecha")');
  assert.equal(
    await page.evaluate('Boolean(document.querySelector("[data-testid=plan-months]"))'),
    false,
  );
  await capture('non-convergent');
  checks.push('Non-convergent projection explains failure and does not invent a date');
  await page.close();
  page = await start(await mkdtemp(join(cache, 'block-c-long-')));
  await waitFor('document.querySelector(".splash")');
  await click('Comenzar →');
  await click('Por ahora no tengo ingresos');
  await click('Continuar');
  await click('Continuar');
  await click('No tengo ¡Qué bien!');
  await click('Continuar');
  await click('Por ahora no reservaré dinero');
  await click('Guardar y ver resumen');
  await waitFor('location.pathname === "/onboarding/summary"');
  await click('Ir a mi Dashboard');
  await click('Deudas');
  await addDebt(
    'Financiación con un nombre extenso registrado para comprobar el ajuste de las tarjetas en pantallas pequeñas',
    '9876543210',
    '20000000',
  );
  await responsive('large-debt');
  await click('Plan');
  await verifyProjection();
  assert.equal(await page.evaluate('document.querySelectorAll(".debt-timeline > li").length'), 12);
  const more = await page.evaluate(
    '[...document.querySelectorAll("button")].find(button => button.textContent.includes("Mostrar más meses")).textContent',
  );
  await click(more);
  assert.equal(await page.evaluate('document.querySelectorAll(".debt-timeline > li").length'), 24);
  await responsive('long-timeline');
  checks.push('Long names, large amounts and long paginated timeline remain responsive');
  assert.deepEqual(runtimeErrors, []);
  await page.close();
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify({ checks, runtimeErrors }, null, 2),
  );
  console.log(`PASS: ${checks.length} browser scenarios`);
  checks.forEach((check) => console.log(`  ✓ ${check}`));
} catch (error) {
  if (page) {
    try {
      await capture('failure');
      console.error(await page.evaluate('document.body.innerText'));
    } catch {
      /* Keep original error. */
    }
  }
  throw error;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  server.kill();
}
