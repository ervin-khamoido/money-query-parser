import { createMoneyQueryParser, formatMoneyQuery, validateMoneyQuery } from './library/index.js';
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
const diagnostic = document.querySelector('#query-diagnostic');
const selectError = document.querySelector('#select-error');
const astInput = document.querySelector('#ast-input');
const astValidation = document.querySelector('#ast-validation-output');
const validatedFormat = document.querySelector('#validated-format');
const currencies = { EUR: 2, USD: 2, JPY: 0, BTC: 8 };
const formats = {
  strict: {},
  en: { groupSeparator: ',' },
  de: { decimalSeparator: ',', groupSeparator: '.' },
  fr: { decimalSeparator: ',', groupSeparator: ' ' },
};
let outputMode = 'ast';
let currentResult;
let currentOptions;
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
  if (result.ok && outputMode === 'sql') {
    output.textContent = JSON.stringify(toPostgresWhere(result.query), null, 2);
    caption.textContent = 'Fixed-schema example. Bind these values with your database driver.';
  } else if (result.ok && outputMode === 'formatted') {
    output.textContent = formatMoneyQuery(result.query, currentOptions);
    caption.textContent = 'Exact major units, explicit currency and your chosen number format.';
  } else {
    output.textContent = JSON.stringify(result, null, 2);
    caption.textContent = 'Amounts are signed integer strings in minor units. Source spans use UTF-16 offsets.';
  }
  for (const button of document.querySelectorAll('[data-output]')) {
    button.setAttribute('aria-pressed', String(button.dataset.output === outputMode));
  }
}

function renderDiagnostic(result) {
  diagnostic.replaceChildren();
  const span = result.ok ? undefined : result.error.span;
  diagnostic.hidden = !span;
  selectError.hidden = !span;
  query.setAttribute('aria-invalid', String(!result.ok));
  query.setAttribute('aria-describedby', 'query-help query-diagnostic');
  if (!span) return;
  const label = document.createElement('span');
  label.className = 'diagnostic-label';
  label.textContent = `Source span [${span.start}, ${span.end})`;
  const expression = document.createElement('code');
  expression.className = 'diagnostic-expression';
  const marked = document.createElement('mark');
  marked.textContent = query.value.slice(span.start, span.end) || '▏';
  expression.append(query.value.slice(0, span.start), marked, query.value.slice(span.end));
  diagnostic.append(label, expression);
}

function renderValidation() {
  let result;
  try {
    result = validateMoneyQuery(JSON.parse(astInput.value), { currencies });
  } catch {
    result = { ok: false, error: { code: 'INVALID_JSON', message: 'Enter valid JSON before AST validation.' } };
  }
  astValidation.textContent = JSON.stringify(result, null, 2);
  astInput.setAttribute('aria-invalid', String(!result.ok));
  validatedFormat.textContent = result.ok
    ? formatMoneyQuery(result.query)
    : 'A valid saved filter will appear here as a search expression.';
}

function render() {
  const options = {
    currencies,
    ...(currency.value === 'none' ? {} : { defaultCurrency: currency.value }),
    ...formats[format.value],
  };
  currentOptions = options;
  currentResult = createMoneyQueryParser(options)(query.value);
  generated.textContent = `import { createMoneyQueryParser, formatMoneyQuery } from 'money-query-parser';\n\nconst options = ${JSON.stringify(options, null, 2)};\nconst parse = createMoneyQueryParser(options);\nconst result = parse(${JSON.stringify(query.value)});\n\nif (result.ok) {\n  console.log(formatMoneyQuery(result.query, options));\n}`;
  renderOutput();
  renderDiagnostic(currentResult);
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
selectError.addEventListener('click', () => {
  if (currentResult.ok || !currentResult.error.span) return;
  query.focus();
  query.setSelectionRange(currentResult.error.span.start, currentResult.error.span.end);
});
astInput.addEventListener('input', renderValidation);
document.querySelector('#valid-ast-example').addEventListener('click', () => {
  astInput.value = JSON.stringify({ kind: 'range', currency: 'EUR', scale: 2, min: '-1000', max: '2000', label: 'removed from the validated snapshot' }, null, 2);
  renderValidation();
});
document.querySelector('#invalid-ast-example').addEventListener('click', () => {
  astInput.value = JSON.stringify({ kind: 'exact', currency: 'EUR', scale: 0, amount: '1250' }, null, 2);
  renderValidation();
});
document.querySelector('#share-example').addEventListener('click', () => {
  const url = new URL(location.href);
  url.hash = 'playground';
  copy(url.toString());
});
render();
renderValidation();
