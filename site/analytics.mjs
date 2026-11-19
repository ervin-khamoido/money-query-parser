const WEBSITE_ID = '4189bdbe-f0c1-4b47-b0ca-3fcc7991437d';
const HOST = 'ervin-khamoido.github.io';
const PATH = '/money-query-parser/';
const EVENTS = new Set([
  'engaged_visit', 'playground_input', 'ast_input', 'example_select',
  'format_change', 'currency_change', 'output_sql', 'output_formatted',
  'copy_install_click', 'copy_code_click', 'copy_result_click', 'share_example_click',
  'outbound_npm', 'outbound_github',
]);

function permitted(win) {
  try {
    const url = new URL(win.location.href);
    return url.protocol === 'https:' && url.hostname === HOST &&
      [PATH, PATH.slice(0, -1)].includes(url.pathname) &&
      url.searchParams.get('analytics') !== 'off' && !win.navigator.webdriver &&
      !win.navigator.globalPrivacyControl && win.navigator.doNotTrack !== '1' &&
      win.doNotTrack !== '1' && !win.localStorage.getItem('umami.disabled');
  } catch {
    // If privacy settings cannot be read, keep the playground working without analytics.
    return false;
  }
}

function sourceOrigin(referrer) {
  try {
    const url = new URL(referrer);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : '';
  } catch { return ''; }
}

export function startAnalytics(win = window, doc = document) {
  if (!permitted(win)) return;
  const pending = new Set();
  const sent = new Set();
  let loaded = false;
  let interacted = false;
  let activeMilliseconds = 0;
  let previousTick = win.performance.now();

  // Build a fresh allowlisted payload: never forward query strings, input values,
  // ASTs, arbitrary event data, referrer paths, identifiers or captured errors.
  win.moneyQueryAnalyticsBeforeSend = (type, payload) => {
    if (!permitted(win) || type !== 'event' || !payload ||
        (payload.name !== undefined && !EVENTS.has(payload.name))) return false;
    return {
      website: WEBSITE_ID,
      hostname: HOST,
      url: PATH,
      title: 'money-query-parser documentation',
      referrer: sourceOrigin(doc.referrer),
      language: win.navigator.language,
      screen: `${win.screen.width}x${win.screen.height}`,
      ...(payload.name === undefined ? {} : { name: payload.name }),
    };
  };

  const send = (name) => {
    if (!loaded || !permitted(win) || sent.has(name)) return;
    sent.add(name);
    try {
      // A blocked tracker or network failure must never break the playground.
      Promise.resolve(name === 'pageview' ? win.umami.track() : win.umami.track(name)).catch(() => {});
    } catch { /* Analytics is optional. */ }
  };
  const track = (name) => {
    if (!EVENTS.has(name) || !permitted(win)) return;
    pending.add(name);
    send(name);
  };
  const onInput = (event) => {
    if (!event.isTrusted || doc.visibilityState !== 'visible') return;
    interacted = true;
    const name = { query: 'playground_input', 'ast-input': 'ast_input', format: 'format_change', currency: 'currency_change' }[event.target?.id];
    if (name) track(name);
  };
  const onClick = (event) => {
    if (!event.isTrusted || doc.visibilityState !== 'visible') return;
    interacted = true;
    const target = event.target?.closest?.('button, a');
    if (!target) return;
    if (target.hasAttribute('data-example')) track('example_select');
    if (target.dataset?.output === 'sql') track('output_sql');
    if (target.dataset?.output === 'formatted') track('output_formatted');
    if (target.dataset?.copy === 'install-command') track('copy_install_click');
    else if (target.hasAttribute('data-copy')) track('copy_code_click');
    if (target.id === 'copy-result') track('copy_result_click');
    if (target.id === 'share-example') track('share_example_click');
    if (target.tagName === 'A') {
      try {
        const url = new URL(target.href);
        if (url.hostname === 'www.npmjs.com') track('outbound_npm');
        if (url.hostname === 'github.com') track('outbound_github');
      } catch { /* Ignore non-URL links. */ }
    }
  };
  const onInteraction = (event) => {
    if (event.isTrusted && doc.visibilityState === 'visible') interacted = true;
  };
  doc.addEventListener('input', onInput);
  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onInteraction);
  doc.addEventListener('pointerdown', onInteraction);
  doc.addEventListener('scroll', onInteraction, { passive: true });
  const timer = win.setInterval(() => {
    const now = win.performance.now();
    if (doc.visibilityState === 'visible' && doc.hasFocus()) {
      // A throttled/background timer or a sleeping laptop cannot add a long gap.
      activeMilliseconds += Math.min(1000, Math.max(0, now - previousTick));
    }
    previousTick = now;
    if (interacted && activeMilliseconds >= 15_000) {
      track('engaged_visit');
      win.clearInterval(timer);
    }
  }, 1000);

  const script = doc.createElement('script');
  script.src = 'https://cloud.umami.is/script.js';
  script.defer = true;
  script.referrerPolicy = 'no-referrer';
  for (const [name, value] of Object.entries({
    'data-website-id': WEBSITE_ID,
    'data-auto-track': 'false',
    'data-exclude-search': 'true',
    'data-exclude-hash': 'true',
    'data-do-not-track': 'true',
    'data-domains': HOST,
    'data-before-send': 'moneyQueryAnalyticsBeforeSend',
  })) script.setAttribute(name, value);
  script.addEventListener('load', () => {
    if (typeof win.umami?.track !== 'function') return;
    loaded = true;
    send('pageview');
    for (const name of pending) send(name);
  });
  doc.head.append(script);
}
