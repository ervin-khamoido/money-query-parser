import { createMoneyQueryParser } from './library/index.js';
import { toPostgresWhere } from './examples/transaction-search.mjs';

const query = document.querySelector('#query');
const format = document.querySelector('#format');
const currency = document.querySelector('#currency');
const output = document.querySelector('#result-output');
const summary = document.querySelector('#result-summary');
const caption = document.querySelector('#result-caption');
const panel = document.querySelector('#result-panel');
const generated = document.querySelector('#generated-code');
const toast = document.querySelector('#toast');
const formats = {
  strict: {},
  en: { groupSeparator: ',' },
  de: { decimalSeparator: ',', groupSeparator: '.' },
  fr: { decimalSeparator: ',', groupSeparator: ' ' },
};
let outputMode = 'ast';
let currentResult;
let toastTimer;

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    notify('Copied to clipboard');
  } catch {
    notify('Clipboard unavailable. Select the text to copy it.');
  }
}

function renderOutput() {
  if (!currentResult) return;
  const result = currentResult;
  panel.dataset.state = result.ok ? 'success' : 'error';
  summary.textContent = result.ok
    ? `${{ exact: 'Exact amount', range: 'Inclusive range', comparison: 'Comparison', currency: 'Currency filter' }[result.query.kind]} · ${result.query.currency} · scale ${result.query.scale}`
    : `${result.error.code} · ${result.error.message}`;
  output.textContent = outputMode === 'sql' && result.ok
    ? JSON.stringify(toPostgresWhere(result.query), null, 2)
    : JSON.stringify(result, null, 2);
  caption.textContent = outputMode === 'sql'
    ? 'Fixed-schema example. Bind these values with your database driver.'
    : 'Amounts are signed integer strings in minor units. JSON-safe by design.';
  for (const button of document.querySelectorAll('[data-output]')) {
    button.setAttribute('aria-pressed', String(button.dataset.output === outputMode));
  }
}

function render() {
  const options = {
    currencies: { EUR: 2, USD: 2, JPY: 0, BTC: 8 },
    ...(currency.value === 'none' ? {} : { defaultCurrency: currency.value }),
    ...formats[format.value],
  };
  currentResult = createMoneyQueryParser(options)(query.value);
  generated.textContent = `import { createMoneyQueryParser } from 'money-query-parser';\n\nconst parse = createMoneyQueryParser(${JSON.stringify(options, null, 2)});\n\nconst result = parse(${JSON.stringify(query.value)});`;
  renderOutput();
  const url = new URL(location.href);
  url.searchParams.set('q', query.value);
  url.searchParams.set('format', format.value);
  url.searchParams.set('currency', currency.value);
  history.replaceState(null, '', url);
}

const parameters = new URLSearchParams(location.search);
if (parameters.has('q')) query.value = parameters.get('q').slice(0, 512);
if (Object.hasOwn(formats, parameters.get('format'))) format.value = parameters.get('format');
if (['EUR', 'USD', 'JPY', 'BTC', 'none'].includes(parameters.get('currency'))) currency.value = parameters.get('currency');

for (const control of [query, format, currency]) control.addEventListener('input', render);
for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    query.value = button.dataset.example;
    format.value = button.dataset.format ?? 'strict';
    currency.value = 'EUR';
    render();
  });
}
for (const button of document.querySelectorAll('[data-output]')) {
  button.addEventListener('click', () => { outputMode = button.dataset.output; renderOutput(); });
}
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', () => copy(document.getElementById(button.dataset.copy).textContent));
}
document.querySelector('#copy-result').addEventListener('click', () => copy(output.textContent));
document.querySelector('#share-example').addEventListener('click', () => {
  const url = new URL(location.href);
  url.hash = 'playground';
  copy(url.toString());
});
render();
