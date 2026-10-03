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
const artifacts = resolve(root, 'tests/browser/artifacts/block-b');
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
const url = 'http://127.0.0.1:4180';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4180', '--strictPort'],
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
  assert.ok(await page.evaluate(expression), `Missing control: ${text}`);
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
async function selectDebt() {
  await page.evaluate(
    `(() => { const select = document.querySelector('select'); select.value = select.options[1].value; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
}
async function openAction(label) {
  await click('Abrir acciones de movimientos');
  await click(label);
  await waitFor('location.pathname === "/transactions/new"');
}
async function rowCount(count) {
  await waitFor(`document.querySelectorAll('.movement-row').length === ${count}`);
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
  const profile = await mkdtemp(join(cache, 'block-b-chrome-'));
  page = await start(profile);
  await waitFor('document.querySelector(".splash")');
  await click('Comenzar →');
  await click('Por ahora no tengo ingresos');
  await click('Continuar');
  await click('Continuar');
  await click('Sí tengo Registraré mis deudas');
  for (const [label, value] of [
    ['Nombre de la deuda', 'Equipo de trabajo'],
    ['Acreedor', 'Proveedor propio'],
    ['Monto original', '419000'],
    ['Saldo pendiente', '419000'],
    ['Cuota mínima mensual', '23000'],
    ['Tasa de interés anual (%)', '0'],
    ['Día de vencimiento', '12'],
  ])
    await fill(label, value);
  await click('Guardar deuda');
  await click('Continuar');
  await click('Por ahora no reservaré dinero');
  await click('Guardar y ver resumen');
  await waitFor('location.pathname === "/onboarding/summary"');
  await click('Ir a mi Dashboard');
  await available('$0');
  await click('Movimientos');
  await waitFor('location.pathname === "/transactions"');
  assert.ok(
    await page.evaluate(
      'document.body.textContent.includes("Todavía no tienes movimientos registrados.")',
    ),
  );
  assert.equal(
    await page.evaluate('document.querySelector(".bottom-nav .active").textContent'),
    'Movimientos',
  );
  await capture('empty');
  checks.push('Real empty history and active bottom navigation');

  await openAction('Nuevo ingreso');
  await click('Guardar ingreso');
  assert.equal(await page.evaluate('location.pathname'), '/transactions/new');
  await fill('Valor', '0');
  await fill('Nombre', 'Proyecto independiente');
  assert.equal(await page.evaluate('document.querySelector("form").checkValidity()'), false);
  await fill('Valor', '913700');
  await responsive('income');
  // Test-only storage failure verifies feedback and retry without changing production.
  await page.evaluate(`(async () => {
    const { IncomeService } = await import('/src/features/income/services/IncomeService.ts');
    const create = IncomeService.prototype.create;
    IncomeService.prototype.create = async function() {
      IncomeService.prototype.create = create;
      throw new Error('Fallo de almacenamiento de prueba');
    };
  })()`);
  await click('Guardar ingreso');
  await waitFor(
    'document.querySelector("[role=alert]")?.textContent.includes("Fallo de almacenamiento")',
  );
  assert.equal(
    await page.evaluate('document.querySelector("button[type=submit]").disabled'),
    false,
  );
  await capture('save-error');
  // Dispatch two submissions in the same turn; the synchronous lock must admit one.
  await page.evaluate(
    `(() => { const form = document.querySelector('form'); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); })()`,
  );
  await waitFor('location.pathname === "/transactions"');
  await rowCount(1);
  assert.ok(
    await page.evaluate(
      'document.querySelector(".movement-row").textContent.includes("+$913.700")',
    ),
  );
  assert.ok(
    await page.evaluate('document.querySelector("[role=status]").textContent.includes("guardado")'),
  );
  await click('Inicio');
  await available('$913.700');
  checks.push('Income form validation, duplicate-submit protection and live dashboard totals');

  await click('Movimientos');
  await openAction('Nuevo gasto');
  await fill('Valor', '47250');
  await fill('Nombre', 'Reparación de equipo');
  await fill('Categoría del gasto', 'Herramientas propias');
  await click('Fijo');
  await click('Transferencia');
  await page.evaluate('document.querySelector("textarea").focus()');
  await page.command('Input.insertText', { text: 'Comprobante del taller' });
  await responsive('expense');
  await click('Guardar gasto');
  await waitFor('location.pathname === "/transactions"');
  await rowCount(2);
  assert.ok(await page.evaluate('document.body.textContent.includes("-$47.250")'));
  await click('Inicio');
  await available('$866.450');
  checks.push('Expense form saves user category and updates movements and dashboard');

  await click('Movimientos');
  await openAction('Registrar pago');
  await selectDebt();
  await fill('Valor', '79000');
  await responsive('payment');
  await click('Guardar pago');
  await waitFor('location.pathname === "/transactions"');
  await rowCount(3);
  await click('Inicio');
  await available('$787.450');
  assert.ok(
    await page.evaluate(
      'document.querySelectorAll(".stat-card")[2].textContent.includes("$340.000")',
    ),
  );
  checks.push('Debt payment creates movement, reduces balance and updates dashboard');

  await click('Movimientos');
  for (const [filter, expected] of [
    ['Ingresos', '+$913.700'],
    ['Gastos', '-$47.250'],
    ['Pagos', '-$79.000'],
  ]) {
    await click(filter);
    await rowCount(1);
    assert.ok(
      await page.evaluate(
        `document.querySelector('.movement-row').textContent.includes(${JSON.stringify(expected)})`,
      ),
    );
  }
  await click('Todos');
  await rowCount(3);
  await responsive('history');
  await click('Abrir acciones de movimientos');
  await responsive('fab');
  await page.command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await page.command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await waitFor('!document.querySelector(".floating-menu")');
  await page.command('Page.reload');
  await rowCount(3);
  await click('Inicio');
  await available('$787.450');
  checks.push(
    'All four filters, FAB Escape and reload persistence; five responsive widths on every screen',
  );

  await page.close();
  page = await start(profile);
  await waitFor('location.pathname === "/dashboard"');
  await available('$787.450');
  await click('Movimientos');
  await rowCount(3);
  checks.push('Full Chrome restart keeps income, expense, payment and debt balance');

  await openAction('Registrar pago');
  await selectDebt();
  await fill('Valor', '341000');
  await waitFor('document.body.textContent.includes("El pago supera el saldo")');
  await click('Guardar pago');
  await waitFor('location.pathname === "/transactions"');
  await rowCount(4);
  await click('Inicio');
  await available('$446.450');
  assert.ok(
    await page.evaluate('document.querySelectorAll(".stat-card")[2].textContent.includes("$0")'),
  );
  await click('Movimientos');
  await openAction('Registrar pago');
  assert.ok(
    await page.evaluate('document.body.textContent.includes("No tienes deudas pendientes")'),
  );
  assert.equal(
    await page.evaluate('Boolean(document.querySelector("button[type=submit]"))'),
    false,
  );
  checks.push('Overpayment preserves domain rules and settled debts cannot be paid again');
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
      /* Keep original failure. */
    }
  }
  throw error;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  server.kill();
}
