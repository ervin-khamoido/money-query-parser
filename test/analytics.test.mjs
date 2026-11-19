import assert from 'node:assert/strict';
import test from 'node:test';
import { startAnalytics } from '../site/analytics.mjs';

function fixture(href = 'https://ervin-khamoido.github.io/money-query-parser/?q=secret-amount#playground') {
  const listeners = new Map();
  const scripts = [];
  const calls = [];
  const timers = new Map();
  const storage = new Map();
  let now = 0;
  const win = {
    location: { href }, navigator: { language: 'en-US' }, screen: { width: 1280, height: 800 },
    performance: { now: () => now }, localStorage: { getItem: (key) => storage.get(key) ?? null },
    setInterval: (callback) => { const id = Symbol(); timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
  };
  const doc = {
    visibilityState: 'visible', focused: true, hasFocus: () => doc.focused,
    referrer: 'https://github.com/private/repo?token=secret#private',
    addEventListener: (type, callback) => listeners.set(type, callback),
    head: { append: (script) => scripts.push(script) },
    createElement: () => ({
      attributes: {}, listeners: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
    }),
  };
  return {
    win, doc, scripts, calls, timers, storage, listeners,
    start: () => startAnalytics(win, doc),
    load: () => {
      win.umami = { track: (name) => { calls.push(name ?? 'pageview'); return Promise.resolve(); } };
      scripts[0].listeners.load();
    },
    emit: (type, target = {}, isTrusted = true) => listeners.get(type)?.({ target, isTrusted }),
    tick: (count = 1, interval = 1000) => {
      for (let i = 0; i < count; i++) { now += interval; for (const callback of timers.values()) callback(); }
    },
  };
}

function button({ id = '', dataset = {}, tagName = 'BUTTON', href } = {}) {
  const element = { id, dataset, tagName, href,
    hasAttribute: (name) => Object.hasOwn(dataset, name.replace('data-', '')),
  };
  return { closest: () => element };
}

test('analytics loads only on the exact canonical site, with automatic tracking disabled', () => {
  const f = fixture(); f.start();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, 'https://cloud.umami.is/script.js');
  assert.equal(f.scripts[0].referrerPolicy, 'no-referrer');
  assert.equal(f.scripts[0].attributes['data-website-id'], '4189bdbe-f0c1-4b47-b0ca-3fcc7991437d');
  for (const name of ['data-exclude-search', 'data-exclude-hash', 'data-do-not-track']) assert.equal(f.scripts[0].attributes[name], 'true');
  assert.equal(f.scripts[0].attributes['data-auto-track'], 'false');
  assert.equal(typeof f.win.moneyQueryAnalyticsBeforeSend, 'function');
  assert.deepEqual(f.calls, []);
  f.load(); f.scripts[0].listeners.load();
  assert.deepEqual(f.calls, ['pageview']);
});

test('previews, mirrors, other GitHub Pages projects and explicit QA URLs never load a tracker', () => {
  for (const href of [
    'http://127.0.0.1:4173/', 'https://money-query-parser-ervin.recentburr3.chatgpt.site/',
    'https://ervin-khamoido.github.io/', 'https://ervin-khamoido.github.io/other-project/',
    'https://ervin-khamoido.github.io/money-query-parser-copy/',
    'https://ervin-khamoido.github.io/money-query-parser/?analytics=off',
    'http://ervin-khamoido.github.io/money-query-parser/',
  ]) {
    const f = fixture(href); f.start();
    assert.equal(f.scripts.length, 0, href);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.timers.size, 0);
  }
});

test('automation signals, browser privacy preferences and owner opt-out prevent all initialization', () => {
  for (const configure of [
    (f) => { f.win.navigator.webdriver = true; },
    (f) => { f.win.navigator.globalPrivacyControl = true; },
    (f) => { f.win.navigator.doNotTrack = '1'; },
    (f) => { f.win.doNotTrack = '1'; },
    (f) => { f.storage.set('umami.disabled', '1'); },
    (f) => { Object.defineProperty(f.win, 'localStorage', { get() { throw new Error('blocked'); } }); },
  ]) {
    const f = fixture(); configure(f); f.start();
    assert.equal(f.scripts.length, 0);
    assert.equal(f.listeners.size, 0);
  }
});

test('the final payload boundary strips queries, ASTs, referrer paths and arbitrary metadata', () => {
  const f = fixture(); f.start();
  const original = { name: 'playground_input', url: '/?q=secret', data: { amount: '1250', ast: {} }, id: 'private-id', stack: 'secret' };
  const cleaned = f.win.moneyQueryAnalyticsBeforeSend('event', original);
  assert.deepEqual(cleaned, {
    website: '4189bdbe-f0c1-4b47-b0ca-3fcc7991437d', hostname: 'ervin-khamoido.github.io',
    url: '/money-query-parser/', title: 'money-query-parser documentation', referrer: 'https://github.com',
    language: 'en-US', screen: '1280x800', name: 'playground_input',
  });
  assert.equal(original.url, '/?q=secret');
  assert.equal(f.win.moneyQueryAnalyticsBeforeSend('identify', original), false);
  assert.equal(f.win.moneyQueryAnalyticsBeforeSend('error', original), false);
  assert.equal(f.win.moneyQueryAnalyticsBeforeSend('event', { name: 'secret event content' }), false);
  f.doc.referrer = 'javascript:secret';
  assert.equal(f.win.moneyQueryAnalyticsBeforeSend('event', {}).referrer, '');
});

test('trusted interactions queue until load and are deduplicated per event per page', () => {
  const f = fixture(); f.start();
  f.emit('input', { id: 'query', value: 'private amount' });
  f.emit('input', { id: 'query', value: 'another private amount' });
  f.emit('click', button({ dataset: { copy: 'install-command' } }));
  assert.deepEqual(f.calls, []);
  f.load();
  assert.deepEqual(f.calls, ['pageview', 'playground_input', 'copy_install_click']);
  f.emit('input', { id: 'query' }); f.emit('click', button({ dataset: { copy: 'install-command' } }));
  assert.equal(f.calls.length, 3);
});

test('named events describe UI actions and never include user-entered data or link URLs', () => {
  const f = fixture(); f.start(); f.load();
  for (const id of ['ast-input', 'format', 'currency']) f.emit('input', { id });
  for (const options of [
    { dataset: { example: 'secret' } }, { dataset: { output: 'sql' } }, { dataset: { output: 'formatted' } },
    { dataset: { copy: 'generated-code' } }, { id: 'copy-result' }, { id: 'share-example' },
    { tagName: 'A', href: 'https://www.npmjs.com/package/money-query-parser?q=secret' },
    { tagName: 'A', href: 'https://github.com/ervin-khamoido/money-query-parser?secret=value' },
  ]) f.emit('click', button(options));
  assert.deepEqual(f.calls, ['pageview', 'ast_input', 'format_change', 'currency_change', 'example_select',
    'output_sql', 'output_formatted', 'copy_code_click', 'copy_result_click', 'share_example_click', 'outbound_npm', 'outbound_github']);
});

test('synthetic events and time alone do not count as engagement', () => {
  const f = fixture(); f.start(); f.load();
  f.emit('input', { id: 'query' }, false); f.emit('click', button({ dataset: { example: '12 EUR' } }), false);
  f.tick(20);
  assert.deepEqual(f.calls, ['pageview']);
  f.emit('keydown'); f.tick();
  assert.deepEqual(f.calls, ['pageview', 'engaged_visit']);
  assert.equal(f.timers.size, 0);
});

test('engagement requires fifteen focused visible seconds; background gaps and sleeping time do not qualify', () => {
  const f = fixture(); f.start(); f.load(); f.emit('pointerdown');
  f.tick(5); f.doc.visibilityState = 'hidden'; f.tick(20);
  f.doc.visibilityState = 'visible'; f.doc.focused = false; f.tick(20);
  f.doc.focused = true; f.tick(1, 600_000); f.tick(8);
  assert.deepEqual(f.calls, ['pageview']);
  f.tick();
  assert.deepEqual(f.calls, ['pageview', 'engaged_visit']);
});

test('an opt-out applied after loading blocks future events and before-send payloads', () => {
  const f = fixture(); f.start(); f.load(); f.storage.set('umami.disabled', '1');
  f.emit('input', { id: 'query' }); f.tick(20);
  assert.deepEqual(f.calls, ['pageview']);
  assert.equal(f.win.moneyQueryAnalyticsBeforeSend('event', {}), false);
});

test('blocked, missing, throwing or rejecting trackers do not break playground actions', async () => {
  const f = fixture(); f.start(); f.emit('input', { id: 'query' }); f.tick(20);
  assert.deepEqual(f.calls, []);
  assert.doesNotThrow(() => f.scripts[0].listeners.load());
  f.win.umami = { track: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => f.scripts[0].listeners.load());
  f.win.umami.track = () => Promise.reject(new Error('offline'));
  f.emit('input', { id: 'ast-input' });
  await new Promise((resolve) => setImmediate(resolve));
});
