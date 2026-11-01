/** Content recognition only: no recalculation, significance inference or styling.
 * Works with persisted source tables as well as freshly parsed workbooks.
 */
export type Scalar = string | number | boolean | null;
export type Category = "raw" | "processed" | "final" | "statistics";
export interface SourceTable {
  sheet_name: string;
  rows: { row: number; cells: { column: string; coordinate: string; value: Scalar; formula?: string }[] }[];
  merged_ranges: string[];
  embedded_images?: { sha256: string; anchor_row: number | null; anchor_column: number | null; sheet_name: string }[];
}
export interface Measurement {
  endpoint: string; treatment: string; value: Scalar; unit: string; source_cell: string;
  replication?: string | null; sd?: number | null; gate?: string | null;
}
export interface ScientificGroup {
  id: string;
  endpoint: string;
  title: string;
  columns: string[];
  rows: Scalar[][];
  source?: SourceTable;
}
export interface ScientificContext {
  samples: Record<string, string>;
  references: string[];
  normalization: { target: string; reference: string }[];
  populations: Record<string, string>;
}
const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();
const colIndex = (column: string) => [...column].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/** Relationships come from explicit paired workbook rows, never sample order guesses. */
export function scientificContext(source?: SourceTable, final: Measurement[] = []): ScientificContext {
  const rows = source?.rows ?? [];
  const find = (pattern: RegExp) => rows.find(row => pattern.test(text(row.cells.find(c => c.column === "A")?.value)));
  const cells = (pattern: RegExp) => find(pattern)?.cells.filter(c => c.column !== "A") ?? [];
  const sampleNames = cells(/^Treatment concentration series labels/i);
  const treatments = cells(/^Treatment concentration series identifications/i);
  const targets = cells(/^Abbreviation:/i);
  const references = cells(/^Housekeeping gene/i);
  const samples: Record<string, string> = {};
  sampleNames.forEach(cell => {
    const treatment = treatments.find(c => c.column === cell.column);
    if (cell.value != null && treatment?.value != null) samples[text(cell.value)] = text(treatment.value);
  });
  const populations: Record<string, string> = {};
  final.forEach(m => { if (m.gate && m.endpoint && !m.endpoint.startsWith("AnnV")) populations[m.gate] = m.endpoint; });
  return {
    samples, references: [...new Set(references.map(c => text(c.value)).filter(Boolean))], populations,
    normalization: targets.flatMap(c => {
      const reference = references.find(r => r.column === c.column)?.value;
      return reference != null ? [{ target: text(c.value), reference: text(reference) }] : [];
    }),
  };
}

export function groupMeasurements(values: Measurement[], category: Category, context: ScientificContext): ScientificGroup[] {
  const groups = new Map<string, ScientificGroup>();
  values.forEach(m => {
    const endpoint = context.populations[m.gate ?? ""] ?? m.endpoint ?? "Unrecognized endpoint";
    const role = context.references.some(r => key(r) === key(endpoint)) ? "Reference gene" : context.normalization.some(r => key(r.target) === key(endpoint)) ? "Target gene" : "Experimental endpoint";
    const summary = category === "final" ? m.replication ? "Replicate results" : "Reported summary" : category === "raw" ? "Experimental measurements" : "Processed measurements";
    const id = [endpoint, m.unit, summary].join("|");
    if (!groups.has(id)) groups.set(id, { id, endpoint, title: `${endpoint} — ${role} — ${m.unit} — ${summary}`,
      columns: ["Sample / treatment", "Condition (workbook mapping)", "Replication", "Value", "Unit", "SD (reported)", "Gate", "Source"], rows: [] });
    groups.get(id)!.rows.push([m.treatment, context.samples[m.treatment] ?? null, m.replication ?? (category === "final" ? "Mean (reported)" : null), m.value, m.unit, m.sd ?? null, m.gate ?? null, m.source_cell]);
  });
  return [...groups.values()];
}

/** Split cytometry biological outcomes from acquisition/technical measurements.
 * Each exported field appears once per record, including unrecognized fields.
 * Units are used only when explicitly present in the export headers.
 */
export function groupFlowRecords(records: Record<string, Scalar>[], source: SourceTable, context: ScientificContext): ScientificGroup[] {
  const groups = new Map<string, ScientificGroup>();
  const identity = new Set(["source_row", "sample", "gate"]);
  const classify = (field: string) => /^(count|volume|concentration|percent_total|percent_gated)$/.test(field) ? "Population measurements" : /^(x_|y_)/.test(field) ? "Channel statistics" : /plate|experiment|group|filename|workspace|compensation|plot|autogate/.test(field) ? "Sample and acquisition metadata" : "Other exported fields";
  records.forEach(record => {
    const gate = text(record.gate);
    const endpoint = context.populations[gate] ?? (gate.startsWith("AnnV") ? gate : `Gating — ${gate || "Unspecified gate"}`);
    Object.entries(record).filter(([field]) => !identity.has(field)).forEach(([field, value]) => {
      const section = classify(field);
      const id = `${endpoint}|${section}`;
      if (!groups.has(id)) groups.set(id, { id, endpoint, title: `${endpoint} — ${section}`, columns: ["Sample", "Gate", "Parameter (export header)", "Value", "Source"], rows: [] });
      groups.get(id)!.rows.push([record.sample ?? null, record.gate ?? null, field, value, `${source.sheet_name}!row ${record.source_row}`]);
    });
  });
  return [...groups.values()];
}

/** Side-by-side statistical panels. Only explicit endpoint headings establish
 * panel boundaries. Unknown/ambiguous headers retain their original wording.
 * All cells, including blank cached formulas, belong to exactly one panel.
 */
export function groupStatistics(source?: SourceTable, endpoints: string[] = []): ScientificGroup[] {
  if (!source?.rows.length) return [];
  const headings = source.rows.flatMap(row => row.cells.filter(c => typeof c.value === "string" && (
    /\(Fold change vs CTRL\)/i.test(c.value) || /^(early apoptotic|late apoptotic|viable|primary necrotic)\s*$/i.test(c.value) || endpoints.some(e => key(e) === key(c.value))
  )).map(c => ({ row: row.row, col: colIndex(c.column), endpoint: text(c.value).replace(/\s*\(Fold change vs CTRL\)/i, "") })));
  const firstHeading = headings.length ? Math.min(...headings.map(h => h.row)) : -1;
  const panels = headings.filter(h => h.row === firstHeading).sort((a, b) => a.col - b.col);
  // In the Annexin template the endpoint title sits above the first data column;
  // use the explicit ANOVA label to locate the panel's preceding row-label column.
  const methodRow = source.rows.find(row => row.cells.filter(c => /^(Anova: single factor|Perform one-way ANOVA)$/i.test(text(c.value))).length === panels.length);
  const starts = panels.map((h, i) => ({ ...h, start: methodRow?.cells.filter(c => /^(Anova: single factor|Perform one-way ANOVA)$/i.test(text(c.value)))[i]?.column }));
  const assigned = new Map<string, { endpoint: string; method: string; rows: SourceTable["rows"] }>();
  const methods = new Map<number, string>();
  source.rows.forEach(row => {
    const buckets = new Map<number, typeof row.cells>();
    row.cells.forEach(cell => {
      const col = colIndex(cell.column);
      let panel = -1;
      starts.forEach((h, i) => { if (col >= (h.start ? colIndex(h.start) : h.col)) panel = i; });
      if (row.row < firstHeading) panel = -1;
      if (!buckets.has(panel)) buckets.set(panel, []);
      buckets.get(panel)!.push(cell);
    });
    buckets.forEach((cells, panel) => {
      const label = text(cells[0]?.value);
      const marker = /^(perform one-way anova|anova: single factor|anova summary|anova table|brown.forsythe test|bartlett.s test|data summary|summary|groups$|.*multiple comparisons test|.*post.hoc|.*t.test)/i.test(label);
      if (marker) methods.set(panel, label);
      const method = methods.get(panel) ?? (panel < 0 ? "Unassigned source / metadata" : "Reported inputs and group mapping");
      const endpoint = panel < 0 ? "Unassigned endpoint" : starts[panel].endpoint;
      const id = `${panel}|${method}`;
      if (!assigned.has(id)) assigned.set(id, { endpoint, method, rows: [] });
      assigned.get(id)!.rows.push({ row: row.row, cells });
    });
  });
  return [...assigned.entries()].map(([id, g]) => ({ id, endpoint: g.endpoint, title: `${g.endpoint} — ${g.method}`, columns: [], rows: [], source: { ...source, rows: g.rows } }));
}