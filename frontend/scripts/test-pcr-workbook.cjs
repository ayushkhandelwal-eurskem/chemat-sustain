const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(relative) {
  const file = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name + '.ts'))), mod, mod.exports);
  return mod.exports;
}
const lib = load('src/lib/pcrWorkbook.ts');
const fixture = [{ endpoint: 'Target', treatment: 'CTRL', value: 0, unit: 'Fold change', source_cell: 'A1', sd: 0 }, { endpoint: 'Target', treatment: 'EC10', value: null, unit: 'Fold change', source_cell: 'B1', sd: null }];
assert.deepEqual(lib.pcrMeasurementTables(fixture)[0].rows, [['Target', 'Mean', 0, null], ['Target', 'SD', 0, null]]);
for (const file of process.argv.slice(2)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const block of [...data.replications, ...data.processed_data.blocks, { measurements: data.final_results.measurements }]) {
    const tables = lib.pcrMeasurementTables(block.measurements, data.test_details.source);
    const count = tables.reduce((n, table) => n + table.rows.filter(row => row[1] !== 'SD').reduce((m, row) => m + row.length - (table.columns[1] === 'Metric' ? 2 : 1), 0), 0);
    assert.equal(count, block.measurements.length);
    for (const value of block.measurements) assert(tables.some(table => table.rows.some(row => row.includes(value.value))));
    assert(tables.every(table => !table.columns.includes('Source') && !table.columns.includes('Gate')));
  }
  const stats = lib.pcrStatisticsTables(data.statistical_analysis.source, data.final_results.measurements.map(value => value.endpoint));
  assert(stats.some(table => table.columns.includes('Adjusted P Value')));
  assert(stats.some(table => table.columns.includes('Mean 1')));
  assert(stats.some(table => table.columns.includes('SS')));
  const hasComparisons = data.final_results.source.rows.some(row => row.cells.some(cell => /Tukey.*test/i.test(String(cell.value ?? ''))));
  assert.equal(lib.pcrFinalComparisons(data.final_results.source).length, hasComparisons ? 1 : 0);
  console.log(`PASS ${path.basename(file)}: all measurements retained, compact gene tables, Mean/SD, named ANOVA/Tukey headers`);
}
assert.equal(lib.pcrStatisticsTables().length, 0);
console.log('PASS PCR empty, zero and null fixtures');