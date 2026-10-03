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
const artifacts = resolve(root, 'tests/browser/artifacts/full-app');
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
const url = 'http://127.0.0.1:4182';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4182', '--strictPort'],
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
      runtimeErrors.push({ browserError: message.params.entry.text, url: message.params.entry.url });
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
try {
  for (let retry = 0; retry < 100; retry++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Await local Vite. */
    }
    await sleep(100);
  }
  const profile = await mkdtemp(join(cache, 'full-app-chrome-'));
  page = await start(profile);
  await waitFor('document.querySelector(".splash")');
  await responsive('splash');
  await click('Comenzar →');
  await fill('Ingreso mensual total', '2370000');
  await responsive('onboarding-income');
  await click('Continuar');
  await capture('onboarding-expenses');
  await click('Continuar');
  await capture('onboarding-debts');
  await click('No tengo ¡Qué bien!');
  await click('Continuar');
  await capture('onboarding-savings');
  await click('Por ahora no reservaré dinero');
  await click('Guardar y ver resumen');
  await waitFor('location.pathname === "/onboarding/summary"');
  await responsive('initial-summary');
  await click('Ir a mi Dashboard');
  await available('$2.370.000');
  await responsive('dashboard');
  checks.push('Splash, all five onboarding steps and persisted dashboard at five viewport sizes');

  // Controlled setup through existing services, never Figma demonstration amounts.
  const ids = await page.evaluate(`(async()=>{
    const {FinanceDatabase}=await import('/src/infrastructure/storage/FinanceDatabase.ts');
    const {createFinanceApplication}=await import('/src/app/services/createFinanceApplication.ts');
    const {findFamily,localDate}=await import('/src/app/services/financeWorkspace.ts');
    const db=new FinanceDatabase();try{const family=await findFamily(db);const app=createFinanceApplication(family.id,db);
      const debt=await app.services.debts.create({name:'Equipo propio',creditor:'Proveedor',principal:81000,minimumPayment:9000,annualInterestRate:0,dueDay:12});
      const expense=await app.services.expenses.create({name:'Servicio pendiente',amount:37000,kind:'fixed',dueDate:localDate()});
      return {debt:debt.id,expense:expense.id};
    }finally{db.close();}
  })()`);
  await route('/transactions', 'Mis movimientos');
  await responsive('transactions');
  await click('Editar Servicio pendiente');
  await fill('Nombre', 'Servicio editado');
  await fill('Valor', '41000');
  await click('Guardar cambios');
  await waitFor('!document.querySelector("dialog[open]")');
  assert.ok(await page.evaluate('document.body.textContent.includes("Servicio editado")'));
  await route('/transactions/new?kind=expense', 'Nuevo gasto');
  await responsive('new-expense');
  await route('/transactions/new?kind=income', 'Nuevo ingreso');
  await capture('new-income');
  await route('/transactions/new?kind=debt-payment', 'Registrar pago');
  await capture('new-payment');
  checks.push('Movement editing persists and all three movement form variants render');

  await route('/debts', 'Mis deudas');
  await responsive('debts');
  await route('/debts/' + ids.debt, 'Equipo propio');
  await responsive('debt-detail');
  await click('Editar deuda');
  await fill('Acreedor', 'Proveedor actualizado');
  await click('Guardar deuda');
  await waitFor('!document.querySelector("dialog[open]")');
  assert.ok(await page.evaluate('document.body.textContent.includes("Proveedor actualizado")'));
  await route('/debt-plan', 'Tu plan');
  await responsive('debt-plan');
  await route('/simulator', '¿Qué pasaría');
  await fill('Pago adicional mensual', '9000');
  await waitFor('document.querySelector("[data-testid=simulated-months]")?.textContent === "5"');
  await responsive('simulator');
  await click('Aplicar al presupuesto');
  await waitFor('location.pathname === "/budget"');
  await click('Revisar escenario');
  await click('Guardar presupuesto');
  await waitFor('!document.querySelector("dialog[open]")');
  await responsive('budget');
  await reload();
  await waitFor('document.body.textContent.includes("Editar presupuesto")');
  await click('Editar presupuesto');
  assert.ok(
    await page.evaluate(
      'document.querySelector("dialog").textContent.includes("Planificar presupuesto")',
    ),
  );
  await click('Cancelar');
  checks.push(
    'Debt detail editing, real simulator result and reviewed monthly budget survive reload',
  );

  await route('/savings', 'Mis metas');
  await click('+ Nueva meta');
  await fill('Nombre de la meta', 'Viaje familiar');
  await fill('Monto objetivo', '900000');
  await click('Guardar meta');
  await waitFor('!document.querySelector("dialog[open]")');
  await click('Agregar →');
  await fill('Valor', '175000');
  await click('Guardar aporte o retiro');
  await waitFor('!document.querySelector("dialog[open]")');
  await click('Agregar →');
  await click('Retirar');
  await fill('Valor', '200000');
  await click('Guardar aporte o retiro');
  await waitFor('document.querySelector("[role=alert]")?.textContent.includes("superar")');
  await fill('Valor', '25000');
  await click('Guardar aporte o retiro');
  await waitFor('!document.querySelector("dialog[open]")');
  await responsive('savings');
  await reload();
  await waitFor('document.querySelector(".goal-card")');
  assert.ok(
    await page.evaluate('document.querySelector(".goal-card").textContent.includes("$150.000")'),
  );
  await route('/transactions', 'Mis movimientos');
  assert.ok(
    await page.evaluate(
      'document.body.textContent.includes("Aporte") && document.body.textContent.includes("Retiro")',
    ),
  );
  checks.push(
    'Savings create, contribution, invalid withdrawal, valid withdrawal, history and reload',
  );

  await route('/calendar', 'Calendario financiero');
  await click('Marcar pagado');
  await waitFor('document.querySelector(".calendar-events").textContent.includes("Pagado")');
  await responsive('calendar');
  await page.evaluate('document.querySelector(".calendar-grid button").click()');
  await waitFor('document.body.textContent.includes("Ver todo el mes")');
  await click('Ver todo el mes');
  await route('/reports', 'Resumen del mes');
  await responsive('reports');
  await route('/more', 'Más herramientas');
  await responsive('more');
  await route('/settings', 'Configuración');
  await click('🏠 Mi hogar Mi familia ›');
  await fill('Nombre del hogar', 'Hogar de prueba');
  await click('Guardar');
  await waitFor('!document.querySelector("dialog[open]")');
  await click('🌙 Modo oscuro');
  await responsive('settings-dark');
  await reload();
  await waitFor('document.querySelector("h1")?.textContent === "Configuración"');
  assert.equal(await page.evaluate('document.documentElement.dataset.theme'), 'dark');
  assert.ok(await page.evaluate('document.body.textContent.includes("Hogar de prueba")'));
  await click('🌙 Modo oscuro');
  await responsive('settings');
  checks.push('Calendar payment/day filtering, reports, More, profile and persistent theme');

  await route('/backup', 'Tus datos');
  await responsive('backup');
  const downloads = await mkdtemp(join(cache, 'full-app-downloads-'));
  await page.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await click('📤 Exportar copia de seguridad');
  let exported;
  for (let i = 0; i < 100; i++) {
    const files = await readdir(downloads);
    exported = files.find((name) => name.endsWith('.json'));
    if (exported) break;
    await sleep(100);
  }
  assert.ok(exported, 'Backup download exists');
  const backupPath = join(downloads, exported);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.family.name, 'Hogar de prueba');
  assert.equal(backup.savingsGoals[0].currentAmount, 150000);
  const invalidPath = join(downloads, 'invalid.json');
  await writeFile(invalidPath, 'not json');
  await upload(invalidPath);
  await waitFor('document.querySelector("[role=alert]")?.textContent.includes("JSON")');
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await click('Cancelar');
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await capture('import-confirmation');
  await click('Reemplazar datos e importar');
  await waitFor('location.pathname === "/dashboard"');
  await available('$2.179.000');
  await reload();
  await waitFor('document.querySelector(".summary-card")');
  await available('$2.179.000');
  checks.push(
    'Actual JSON download, schema rejection, import cancel/confirm and reload with restored balances',
  );
  await route('/savings', 'Mis metas');
  await click('Editar meta');
  await fill('Nombre de la meta', 'Meta editada');
  await click('Guardar meta');
  await waitFor('!document.querySelector("dialog[open]")');
  await click('Editar meta');
  await click('Eliminar meta');
  await click('Confirmar eliminación');
  await waitFor('!document.querySelector(".goal-card")');
  await route('/transactions', 'Mis movimientos');
  await fill('Buscar movimientos', 'Servicio editado');
  assert.equal(await page.evaluate('document.querySelectorAll(".movement-row").length'), 1);
  await click('Editar Servicio editado');
  await click('Eliminar movimiento');
  await click('Confirmar eliminación');
  await waitFor('!document.querySelector("dialog[open]")');
  await route('/debts/' + ids.debt, 'Equipo propio');
  await click('Eliminar deuda');
  await click('Cancelar');
  await click('Eliminar deuda');
  await click('Confirmar eliminación');
  await waitFor('location.pathname === "/debts"');
  assert.ok(
    await page.evaluate('document.body.textContent.includes("No tienes deudas registradas")'),
  );
  await route('/settings', 'Configuración');
  await click('💱 Moneda COP ›');
  await page.evaluate(
    `(()=>{const select=document.querySelector('dialog select');select.value='USD';select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await click('Guardar');
  await waitFor('!document.querySelector("dialog[open]")');
  await reload();
  await waitFor('document.querySelector("h1")?.textContent === "Configuración"');
  assert.ok(await page.evaluate('document.body.textContent.includes("USD")'));
  await route('/backup', 'Tus datos');
  await upload(backupPath);
  await waitFor('document.querySelector("dialog[open]")');
  await click('Reemplazar datos e importar');
  await waitFor('location.pathname === "/dashboard"');
  await available('$2.179.000');
  checks.push(
    'Goal edit/delete, movement search/delete, debt delete/cancel, currency persistence and complete restore',
  );
  assert.deepEqual(runtimeErrors, []);
  await page.close();
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify(
      {
        checks,
        runtimeErrors,
        screens: [
          'splash',
          'onboarding',
          'initial-summary',
          'dashboard',
          'movimientos',
          'agregar-movimiento',
          'deudas',
          'detalle-deuda',
          'plan-deudas',
          'simulador',
          'presupuesto',
          'ahorros',
          'calendario',
          'reportes',
          'configuracion',
          'mas',
          'respaldo',
        ],
        viewports: [320, 390, 430, 768, 1280],
      },
      null,
      2,
    ),
  );
  console.log(`PASS: ${checks.length} full application scenarios`);
  checks.forEach((c) => console.log(c));
} catch (error) {
  if (page) {
    try {
      await capture('failure');
      console.error(await page.evaluate('document.body.innerText'));
    } catch {
      /* Preserve original failure. */
    }
  }
  throw error;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  server.kill();
}

