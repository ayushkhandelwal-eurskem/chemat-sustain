const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const recharts = require('recharts');
const file = path.resolve(__dirname, '../src/components/tests/shared/WorkbookCharts.tsx');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name === 'recharts' ? {
  ...recharts,
  // Fixed dimensions let the actual Recharts SVG render without ResizeObserver.
  ResponsiveContainer: ({ children }) => React.cloneElement(children, { width: 900, height: 430 }),
} : require(name), mod, mod.exports);
const charts = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : [{
  id: 'test', title: 'Population', kind: 'bar', sheet: 'Final results', categories: ['NC', 'PC'],
  series: [{ name: 'Viable', values: [0, 12], errors: [[0, 1], [0, 2]] }],
  x_title: '', y_title: '', y_min: 0, y_max: 100,
}];
const Component = mod.exports.default;
assert.equal(renderToStaticMarkup(React.createElement(Component, { charts: [] })), '');
const html = renderToStaticMarkup(React.createElement(Component, { charts }));
assert.equal((html.match(/class="recharts-wrapper"/g) || []).length, charts.length);
assert(html.includes('recharts-errorBar'));
for (const chart of charts) for (const series of chart.series) {
  assert(html.includes(series.name));
  for (const value of series.values) if (value !== null) assert(html.includes(String(value)));
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], `<!doctype html><html><body style="background:white;color:#171717">${html}</body></html>`);
console.log(`PASS ${charts.length} native workbook graphs render SVG, error bars and exact-value tables`);