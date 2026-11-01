const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const assert=require('node:assert/strict');
function load(name) {
  const file=path.resolve(__dirname,'../src/lib',name+'.ts');
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',js)(request=>load(request.replace('./','')),mod,mod.exports);
  return mod.exports;
}
const {annexinFinalTables,annexinSampleTables,annexinAcceptance,annexinStatisticsTables}=load('annexinWorkbook');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const tables=annexinFinalTables(data.final_results.measurements);
assert.equal(tables.length,4);
assert.deepEqual(tables.slice(0,3).map(t=>t.rows.length),[4,4,4]);
assert.equal(tables[3].rows.length,8);
for(const m of data.final_results.measurements) {
  const table=m.replication?tables.find(t=>t.title===m.replication):tables[3];
  const row=table.rows.find(r=>r[0]===m.endpoint&&(m.replication||r[2]==='Mean'));
  assert.equal(row[table.columns.indexOf(m.treatment)],m.value);
  if(!m.replication) assert.equal(table.rows.find(r=>r[0]===m.endpoint&&r[2]==='SD')[table.columns.indexOf(m.treatment)],m.sd);
}
for(const block of data.replications) assert.equal(annexinSampleTables(block.records).flatMap(t=>t.rows).length,block.records.length);
assert.equal(annexinAcceptance(data.final_results.source).rows.length,6);
const stats=annexinStatisticsTables(data.statistical_analysis.source,data.final_results.measurements.map(m=>m.endpoint));
assert(stats.some(t=>t.columns.includes('p-Value')));
assert(stats.some(t=>t.columns.includes('P-value (T-test)')));
console.log('PASS ANNX workbook layout: 3 experiment tables, all 80 final values and 20 SDs, all flow rows, 6 acceptance criteria, named ANOVA/post-hoc headers');