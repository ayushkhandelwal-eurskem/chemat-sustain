import type { Measurement, Scalar, SourceTable } from "./scientificRecognition";
import { groupStatistics, scientificContext } from "./scientificRecognition";
import type { WorkbookTable } from "./annexinWorkbook";

/** Each measurement occurs once in a gene-by-treatment table; never recalculate. */
export function pcrMeasurementTables(values: Measurement[], conditions?: SourceTable): WorkbookTable[] {
  const context = scientificContext(conditions);
  const groups = new Map<string, Measurement[]>();
  values.forEach(value => {
    const key = `${value.replication ?? "Reported Mean/SD"}|${value.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  });
  return [...groups.values()].map(group => {
    const treatments = [...new Set(group.map(value => value.treatment))];
    const genes = [...new Set(group.map(value => value.endpoint))];
    const summary = !group[0].replication;
    const rows: Scalar[][] = genes.flatMap(gene => {
      const selected = group.filter(value => value.endpoint === gene);
      const reference = context.normalization.find(item => item.target === gene)?.reference;
      const label = reference ? `${gene} (reference: ${reference})` : context.references.includes(gene) ? `${gene} (reference gene)` : gene;
      const mean = [label, ...(summary ? ["Mean"] : []), ...treatments.map(treatment => selected.find(value => value.treatment === treatment)?.value ?? null)];
      return summary ? [mean, [label, "SD", ...treatments.map(treatment => selected.find(value => value.treatment === treatment)?.sd ?? null)]] : [mean];
    });
    return { title: `${group[0].replication ?? "Reported Mean/SD"} — ${group[0].unit}`,
      columns: ["Gene", ...(summary ? ["Metric"] : []), ...treatments.map(treatment => context.samples[treatment] ? `${treatment} — ${context.samples[treatment]}` : treatment)], rows };
  });
}

/** Preserve literal final-sheet comparison headings, including ambiguous labels. */
export function pcrFinalComparisons(source?: SourceTable): WorkbookTable[] {
  const rows = source?.rows ?? [];
  const result: WorkbookTable[] = [];
  rows.forEach((row, index) => {
    const heading = row.cells.find(cell => /Tukey.*test|post.hoc.*test/i.test(String(cell.value ?? "")));
    if (!heading) return;
    const headers = row.cells.filter(cell => columnIndex(cell.column) >= columnIndex(heading.column));
    const values: Scalar[][] = [];
    for (const next of rows.slice(index + 1)) {
      if (!next.cells.some(cell => cell.column === heading.column && /\bv(?:s)?\.?\s/i.test(String(cell.value ?? "")))) break;
      values.push(headers.map(header => next.cells.find(cell => cell.column === header.column)?.value ?? null));
    }
    if (values.length) result.push({ title: String(heading.value), columns: headers.map((cell, i) => i === 0 ? "Comparison" : String(cell.value ?? "Reported result")), rows: values });
  });
  return result;
}

const columnIndex = (column: string) => [...column].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/** Read headers inside each endpoint panel rather than displaying Excel letters. */
export function pcrStatisticsTables(source?: SourceTable, endpoints: string[] = []): WorkbookTable[] {
  const panels = new Map<string, SourceTable["rows"]>();
  for (const group of groupStatistics(source, endpoints)) {
    if (group.endpoint === "Unassigned endpoint") continue;
    panels.set(group.endpoint, [...(panels.get(group.endpoint) ?? []), ...(group.source?.rows ?? [])]);
  }
  const tables: WorkbookTable[] = [];
  for (const [endpoint, panel] of panels) {
    const rows = panel.sort((a, b) => a.row - b.row);
    let current: WorkbookTable | null = null;
    let fields: string[] = [];
    const flush = () => { if (current?.rows.length) tables.push(current); };
    for (const row of rows) {
      const cells = [...row.cells].sort((a, b) => columnIndex(a.column) - columnIndex(b.column));
      const first = cells[0], label = String(first?.value ?? "").trim();
      if (!label) continue;
      const header = /\(Fold change vs CTRL\)|^ANOVA table$|^Tukey.*comparisons test$|^Test details$/i.test(label);
      const marker = /^(ANOVA summary|Brown.Forsythe test|Bartlett.s test|Data summary|Perform one-way ANOVA|Post.hoc Multiple comparisons test)/i.test(label);
      if (header || marker || !current) {
        flush();
        fields = header ? cells.map(cell => cell.column) : [];
        current = { title: `${endpoint} — ${label}`, columns: header ? cells.map((cell, i) => i === 0 ? (/Fold change/i.test(label) ? "Replication" : /Test details|Tukey/i.test(label) ? "Comparison" : "Source of variation") : String(cell.value ?? "Reported value")) : ["Parameter", "Reported value"], rows: [] };
        if (header || marker) continue;
      }
      if (!current) continue;
      if (fields.length) current.rows.push(fields.map(column => cells.find(cell => cell.column === column)?.value ?? null));
      else current.rows.push([first.value, ...cells.slice(1).map(cell => cell.value)]);
    }
    flush();
  }
  return tables;
}