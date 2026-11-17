// Drives the interface in headless Chrome: the poster view, selection, review, time travel, editing, a phone.
// Saves screenshots and fails on any page error.   usage: node tools/ui_check.mjs [outDir=media/check]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, '..', 'media', 'check'));
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;
const PORT = 9400 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), 'hi-ui-check-' + PORT);
mkdirSync(out, { recursive: true });
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1440,860', '--hide-scrollbars',
  '--no-first-run', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push(`console.${d.params.type}: ` + d.params.args.map((a) => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { errors.push('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return undefined; } return r.result.value; };
  const size = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(out, name + '.png'), Buffer.from(s.data, 'base64')); console.log('shot', name); };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no element: ' + ${JSON.stringify(sel)}); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()`);
  // the drawing listens to pointer events: a tap is pointerdown + pointerup on the same spot
  const tap = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no element: ' + ${JSON.stringify(sel)});
    const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); })()`);
  const text = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.innerText`);
  const state = () => js(`JSON.stringify(HI.store.edgesAt(HI.store.head()).map(e => e.id + ':' + e.status))`);
  const fresh = async () => { await send('Page.navigate', { url }); await sleep(900); await js('localStorage.clear()'); await send('Page.navigate', { url }); await sleep(1200); };

  await send('Page.enable'); await send('Runtime.enable'); await size(1440, 860);
  await fresh();
  await shot('01-poster-view');
  console.log('opens on:', await text('#panel h1'), '|', await state());
  await tap('[data-node="cup"]'); await sleep(200); console.log('entity:', await text('#panel h1')); await shot('02-entity-cup');
  await tap('.caption[data-edge="e1"]'); await sleep(200); console.log('edge:', await text('#panel h1')); await shot('03-e1-selected');
  await click('.tick[data-id="0"]'); await sleep(300); console.log('t0 edges:', await js('document.querySelectorAll("#canvas .hull").length')); await shot('04-t0');
  await click('.tick.now'); await sleep(200);
  await click('#rail [data-id="review"]'); await sleep(200); await shot('05-review');
  await click('#panel [data-act="validate"]'); await sleep(400); console.log('after validating e2:', await state(), '| commits', await js('HI.store.db.commits.length')); await shot('06-e2-validated');
  await click('#robot-view'); await sleep(300); console.log('robot view hulls:', await js('document.querySelectorAll("#canvas .hull").length')); await shot('07-robot-view'); await click('#robot-view'); await sleep(200);
  await click('#rail [data-id="history"]'); await sleep(200); await shot('08-history');
  await click('#rail [data-id="edit"]'); await click('[data-act="new-edge"]'); await sleep(200);
  await js(`document.querySelector('#f-sentence').value = 'Operator checks robot R1'; document.querySelector('.a-word').value = 'checks'`);
  await click('[data-act="form-save"]'); await sleep(400); console.log('created:', await text('#panel h1'), '|', await state()); await shot('09-new-fact');

  await size(390, 800, true); await fresh(); await shot('10-phone');
  await tap('.caption[data-edge="e2"]'); await sleep(200); await click('#panel [data-act="deprecate"]'); await sleep(400);
  console.log('phone, after deprecating e2:', await state()); await shot('11-phone-deprecated');
  await js('localStorage.clear()');
  ws.close();
} finally { chrome.kill(); await sleep(400); rmSync(profile, { recursive: true, force: true }); }
console.log(errors.length ? 'PAGE ERRORS:\n' + [...new Set(errors)].join('\n') : 'no page errors');
process.exitCode = errors.length ? 1 : 0;
