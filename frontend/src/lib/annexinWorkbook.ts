import type { Measurement, Scalar, SourceTable } from "./scientificRecognition";
import { groupStatistics } from "./scientificRecognition";

export interface WorkbookTable { title: string; columns: string[]; rows: Scalar[][] }

/** Follow workbook order: experiment → populations × treatments → Mean/SD. */
export function annexinFinalTables(values: Measurement[]): WorkbookTable[] {
  const replications = [...new Set(values.map(v=>v.replication).filter((r): r is string=>!!r))];
  const tables: WorkbookTable[] = replications.map(replication=> {
    const selected=values.filter(v=>v.replication===replication);
    const treatments=[...new Set(selected.map(v=>v.treatment))];
    const endpoints=[...new Set(selected.map(v=>v.endpoint))];
    return {title:replication, columns:["Cell population", "Gate", ...treatments], rows:endpoints.map(endpoint=> {
      const row=selected.filter(v=>v.endpoint===endpoint);
      return [endpoint, row[0]?.gate??null, ...treatments.map(t=>row.find(v=>v.treatment===t)?.value??null)];
    })};
  });
  const summary=values.filter(v=>!v.replication);
  if (summary.length) {
    const treatments=[...new Set(summary.map(v=>v.treatment))];
    tables.push({title:"Table Mean/SD — % of cell population", columns:["Cell population", "Gate", "Metric", ...treatments],
      rows:[...new Set(summary.map(v=>v.endpoint))].flatMap(endpoint=> {
        const row=summary.filter(v=>v.endpoint===endpoint);
        return [
          [endpoint,row[0]?.gate??null,"Mean",...treatments.map(t=>row.find(v=>v.treatment===t)?.value??null)],
          [endpoint,row[0]?.gate??null,"SD",...treatments.map(t=>row.find(v=>v.treatment===t)?.sd??null)],
        ];
      })});
  }
  return tables;
}

/** Flow rows remain rows, rather than expanding each record into 30 labels. */
export function annexinSampleTables(records: Record<string, Scalar>[]): WorkbookTable[] {
  const fields=["gate","count","volume","concentration","percent_total","percent_gated"];
  return [...new Set(records.map(r=>String(r.sample??"Unspecified sample")))].map(sample=>({
    title:sample, columns:["Gate", "Event count", "Volume (export)", "Concentration (export)", "%Total", "%Gated"],
    rows:records.filter(r=>String(r.sample??"Unspecified sample")===sample).map(r=>fields.map(f=>r[f]??null)),
  }));
}

export function annexinAcceptance(source?: SourceTable): WorkbookTable | null {
  const rows:Scalar[][]=[];
  let replication:Scalar=null;
  source?.rows.forEach(row=>{
    const identifier=row.cells.find(c=>c.column==="C"&&/^WP\d+_.+R\d+$/.test(String(c.value??"")));
    if(identifier) replication=identifier.value;
    const criterion=row.cells.find(c=>/Negative control should|Each sample should contain/i.test(String(c.value??"")));
    if(criterion) rows.push([replication,criterion.value,row.cells.find(c=>/^(YES|NO|PASSED|FAILED)$/i.test(String(c.value??"")))?.value??null]);
  });
  return rows.length?{title:"Acceptance criteria (as reported)",columns:["Replication", "Criterion", "Reported outcome"],rows}:null;
}

/** Use worksheet headers, not Excel letters, for statistical tables. */
export function annexinStatisticsTables(source?:SourceTable,endpoints:string[]=[]):WorkbookTable[] {
  return groupStatistics(source,endpoints).filter(group=>group.endpoint!=="Unassigned endpoint").flatMap(group=>{
    const rows=group.source?.rows??[];
    const columns=[...new Set(rows.flatMap(r=>r.cells.map(c=>c.column)))].sort((a,b)=>a.length-b.length||a.localeCompare(b));
    const values=rows.map(row=>columns.map(col=>row.cells.find(c=>c.column===col)?.value??null));
    const title=`${group.endpoint} — ${group.title.replace(`${group.endpoint} — `,"")}`;
    const tables:WorkbookTable[]=[];
    let current:WorkbookTable={title,columns:["Parameter / group",...columns.slice(1).map(()=>"Reported value")],rows:[]};
    values.forEach(row=>{
      const label=String(row[0]??"");
      if(/^(Groups|Source of variation|Groups$)/i.test(label)&&row.slice(1).some(v=>typeof v==="string")) {
        if(current.rows.length) tables.push(current);
        current={title:`${group.endpoint} — ${label==="Groups"?"Post-hoc comparisons and alpha levels":"ANOVA table"}`,columns:row.map((v,i)=>v==null?`Reported field ${i+1}`:String(v)),rows:[]};
      } else if(row.some(v=>v!=null&&String(v).trim()!=="")) current.rows.push(row);
    });
    if(current.rows.length) tables.push(current);
    return tables;
  });
}