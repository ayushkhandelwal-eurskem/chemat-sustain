import openpyxl
import re
import json
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Union, Any
import logging
import traceback
from datetime import datetime, timedelta

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
logging.getLogger("multipart.multipart").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

_ROS_ID = r'WP(\d+)_ROS_(\d+)([a-zA-Z])R(\d+)'

class ROSParser:
    def __init__(self, file_path, sheet_name="Test_conditions"):
        self.file_path = file_path
        try:
            self.wb = openpyxl.load_workbook(file_path, data_only=True)
            # Handle both "Test_conditions" and "Test Information" sheet names
            if sheet_name in self.wb.sheetnames:
                self.ws = self.wb[sheet_name]
            elif "Test Information" in self.wb.sheetnames:
                self.ws = self.wb["Test Information"]
            else:
                self.ws = self.wb[self.wb.sheetnames[0]]
        except Exception as e:
            logger.error(f"Failed to load workbook: {e}"); raise
        self.email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

    def _nk(self, key):
        if not key: return None
        return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", str(key).strip().lower())).strip("_")

    def _sf(self, v):
        if v in (None, ""): return None
        try:
            if isinstance(v, str): v = v.replace(",", ".").strip()
            return float(v)
        except: return None

    def _date(self, v):
        try:
            if isinstance(v, datetime): return v.strftime("%Y-%m-%d")
            if isinstance(v, (int, float)): return (datetime(1899, 12, 30) + timedelta(days=float(v))).strftime("%Y-%m-%d")
            if isinstance(v, str):
                for f in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
                    try: return datetime.strptime(v.strip(), f).strftime("%Y-%m-%d")
                    except: pass
            return str(v).strip() if v else None
        except: return str(v).strip() if v else None

    def _kv(self, max_col=6):
        data = []
        for ri, row in enumerate(self.ws.iter_rows(min_row=1, max_col=max_col), start=1):
            k = row[0].value
            if not k: continue
            key = self._nk(k)
            if not key: continue
            val = None
            for c in range(1, min(len(row), max_col)):
                if row[c].value is not None: val = row[c].value; break
            email = row[3].value if len(row) > 3 else None
            data.append({"row": ri, "key": key, "value": val, "email": email})
        return data

    def _g(self, rows, *keys):
        return next((r["value"] for r in rows if any(k in r["key"] for k in keys) and r["value"] is not None), None)

    def _find_sheets(self, prefix):
        p = prefix.lower()
        seen = set()
        result = []
        for s in sorted(self.wb.sheetnames):
            sl = s.lower()
            if sl in seen: continue
            if sl.startswith(p) or sl.startswith(p.replace(" ", "_")) or sl.startswith(p.replace("_", " ")):
                seen.add(sl); result.append(s)
        return result

    # ---- Test Details ----
    def extract_work_package(self):
        rows = self._kv()
        lead, assay = [], []
        for r in rows:
            if "lead_scientist" in r["key"]:
                lead.append({"name": r["value"], "email": r["email"] if r["email"] and re.match(self.email_regex, str(r["email"])) else None})
            if "assay_test_work_conducted_by" in r["key"]:
                assay.append({"name": r["value"], "email": r["email"] if r["email"] and re.match(self.email_regex, str(r["email"])) else None})
        g = lambda *k: self._g(rows, *k)
        return {"wp_name": g("project_work_package"), "partner": g("partner_conducting_test_assay"), "laboratory_name": g("test_facility_laboratory_name"), "full_test_name": g("full_name_of_test_assay"), "test_acronym": g("short_name_or_acronym"), "test_type": g("type_or_class_of_experimental"), "endpoint": g("end_point_being_investigated"), "endpoint_outcome": g("metric_s_used_to_assess"), "sop": g("sop_s_for_test"), "path": g("path_link_to_sop"), "lead_scientists": lead, "assay_scientists": assay}

    def extract_material(self):
        rows = self._kv()
        g = lambda *k: self._g(rows, *k)
        return {"material_identifier": next((r["value"] for r in rows if r["key"] == "sample_cms_internal_identifier"), None), "erm_id": g("erm_identifier"), "material_name": next((r["value"] for r in rows if r["key"] == "material_name"), None), "core_chemistry": g("core_chemistry"), "cas_no": next((r["value"] for r in rows if r["key"] == "cas_no"), None), "cas_for_core": g("cas_for_core"), "material_supplier": g("material_supplier"), "material_state": g("material_state"), "batch": g("batch"), "vial": g("vial"), "preparation_date": self._date(g("date_of_preparation")), "size": g("size")}

    def extract_cell_line(self):
        rows = self._kv()
        ws = self.ws
        g = lambda *k: self._g(rows, *k)
        # Passage numbers from row 63
        passages = []
        for c in range(2, 8):
            v = ws.cell(row=63, column=c).value
            if v is not None: passages.append(v)
        return {"cell_type": g("detailed_cell_type"), "cell_line_short": g("cell_line_short_name"), "supplier": next((r["value"] for r in rows if r["key"] == "supplier"), None), "passage_numbers": passages, "plate_details": g("plate_details"), "cells_per_well": g("number_of_cells_per_well"), "volume_per_well": g("total_volume_per_well"), "medium": g("medium"), "serum": g("serum"), "serum_concentration_culture": g("serum_concentration_in_culture"), "serum_concentration_treatment": g("serum_concentration_in_treatment"), "serum_heat_inactivated": g("serum_heat_inactivated"), "antibiotics": g("antibiotics"), "complete_growth_medium": g("complete_growth_medium"), "culture_conditions": g("cell_culture_conditions")}

    def extract_dispersion(self):
        rows = self._kv()
        g = lambda *k: self._g(rows, *k)
        return {"dispersion_protocol": g("standard_dispersion_protocol", "specify_standard_dispersion"), "dispersion_technique": g("dispersion_technique", "otherwise_specify_dispersion"), "dispersion_agent": g("dispersion_agent"), "dispersed_in_medium": g("dispersed_in_cell_culture"), "aids_used": g("aids_used"), "time_duration": g("specify_time_duration"), "energy": g("energy")}

    def extract_treatment(self):
        ws = self.ws
        g = lambda *k: self._g(self._kv(), *k)
        # Concentration labels from row 84
        conc_labels = [ws.cell(row=84, column=c).value for c in range(2, 12) if ws.cell(row=84, column=c).value]
        conc_values = [self._sf(ws.cell(row=85, column=c).value) for c in range(2, 12) if ws.cell(row=85, column=c).value is not None]
        conc_particles = [self._sf(ws.cell(row=86, column=c).value) for c in range(2, 12) if ws.cell(row=86, column=c).value is not None]
        plate_series = [ws.cell(row=87, column=c).value for c in range(2, 12) if ws.cell(row=87, column=c).value]
        return {"time_unit": g("time_point_unit"), "time_labels": [ws.cell(row=80, column=c).value for c in range(2, 8) if ws.cell(row=80, column=c).value], "time_points": [ws.cell(row=81, column=c).value for c in range(2, 8) if ws.cell(row=81, column=c).value], "concentration_unit": g("treatment_concentration_series_unit"), "concentration_labels": conc_labels, "concentration_values_ug_ml": conc_values, "concentration_values_particles": conc_particles, "plate_series": plate_series, "positive_control": g("positive_controls_description"), "negative_control": g("negative_controls_description"), "num_experiments": g("number_of_experiments")}

    def extract_instrumentation(self):
        rows = self._kv()
        g = lambda *k: self._g(rows, *k)
        return {"solvent_for_dcf": g("solvent_for_da_dfc", "solvent_for_dcf"), "incubation_time": g("incubation_time_with_da_dfc", "incubation_time"), "volume_of_solvent": g("volume_of_solvent")}

    # ---- Replication Metadata ----
    def extract_replication_metadata(self):
        ws = self.ws; meta = []
        raw_sheets = self._find_sheets("raw_data_") + self._find_sheets("raw data_")
        proc_sheets = self._find_sheets("processed_data_") + self._find_sheets("processed data_")
        for ri in range(38, 50):
            tid = ws.cell(row=ri, column=2).value
            if tid is None: continue
            ts = str(tid).strip()
            if not re.search(r'R\d+', ts, re.IGNORECASE): continue
            raw = next((s for s in raw_sheets if ts.lower() in s.lower()), None)
            proc = next((s for s in proc_sheets if ts.lower() in s.lower()), None)
            replicate_label = ws.cell(row=ri, column=5).value
            meta.append({"test_identifier_number": ts, "test_start_date": self._date(ws.cell(row=ri, column=3).value), "test_end_date": self._date(ws.cell(row=ri, column=4).value), "replicate_label": str(replicate_label) if replicate_label else None, "raw_sheet_name": raw, "processed_sheet_name": proc})
        return meta

    # ---- Raw Data ----
    def extract_raw_data(self):
        blocks = []
        raw_sheets = [s for s in self._find_sheets("raw_data_") + self._find_sheets("raw data_") if re.search(_ROS_ID, s, re.IGNORECASE)]
        # Deduplicate
        seen = set()
        for sn in raw_sheets:
            if sn in seen: continue
            seen.add(sn)
            ws = self.wb[sn]
            m = re.search(_ROS_ID, sn, re.IGNORECASE)
            run_label = f"R{m.group(4)}" if m else sn
            # Extract plate reader readings
            readings = []
            for r in range(3, min(ws.max_row+1, 20)):
                well = ws.cell(row=r, column=5).value
                if well is None: continue
                reading1 = self._sf(ws.cell(row=r, column=8).value)
                reading2 = self._sf(ws.cell(row=r, column=18).value)
                well_type = ws.cell(row=r, column=6).value
                readings.append({"well": str(well), "type": str(well_type) if well_type else None, "reading_1": reading1, "reading_2": reading2, "mean": round((reading1 + reading2) / 2, 2) if reading1 and reading2 else reading1})
            blocks.append({"metric_name": f"ROS Fluorescence {run_label}", "raw_sheet_name": sn, "run_label": run_label, "unit": "Counts", "reading_count": len(readings), "readings": readings})
        return blocks

    # ---- Processed Data ----
    def extract_processed_data(self):
        blocks = []
        proc_sheets = [s for s in self._find_sheets("processed_data_") + self._find_sheets("processed data_") if re.search(_ROS_ID, s, re.IGNORECASE)]
        seen = set()
        for sn in proc_sheets:
            if sn in seen: continue
            seen.add(sn)
            ws = self.wb[sn]
            m = re.search(_ROS_ID, sn, re.IGNORECASE)
            run_label = f"R{m.group(4)}" if m else sn
            # Row 5: group headers (NC, conc values, PC)
            group_headers = []
            for c in range(3, min(ws.max_column+1, 20)):
                v = ws.cell(row=5, column=c).value
                if v is not None and "μg" not in str(v) and "ug" not in str(v).lower():
                    group_headers.append({"col": c, "label": str(v)})
            # Row 6-8: experiment data (3 rows of measurements)
            experiment_label = ws.cell(row=6, column=1).value or ws.cell(row=29, column=2).value
            raw_values = []
            for r in range(6, 9):
                row_vals = {}
                for gh in group_headers:
                    v = self._sf(ws.cell(row=r, column=gh["col"]).value)
                    row_vals[gh["label"]] = v
                raw_values.append(row_vals)
            # Row 32-34: Mean, SD, CV
            mean_row, sd_row, cv_row = {}, {}, {}
            for gh in group_headers:
                mean_row[gh["label"]] = self._sf(ws.cell(row=32, column=gh["col"]).value)
                sd_row[gh["label"]] = self._sf(ws.cell(row=33, column=gh["col"]).value)
                cv_row[gh["label"]] = self._sf(ws.cell(row=34, column=gh["col"]).value)
            # Acceptance
            acceptance = ws.cell(row=43, column=8).value
            blocks.append({"run_label": run_label, "processed_sheet_name": sn, "experiment_label": str(experiment_label) if experiment_label else None, "group_headers": [gh["label"] for gh in group_headers], "raw_values": raw_values, "mean": mean_row, "sd": sd_row, "cv": cv_row, "acceptance": str(acceptance) if acceptance else None})
        return blocks

    # ---- Final Results ----
    def extract_final_results(self):
        sheets = self._find_sheets("final_results") + self._find_sheets("final results")
        if not sheets: return {"available": False}
        ws = self.wb[sheets[0]]
        # Row 6: group headers
        group_headers = []
        for c in range(3, min(ws.max_column+1, 12)):
            v = ws.cell(row=6, column=c).value
            if v is not None and "μg" not in str(v) and "ug" not in str(v).lower():
                group_headers.append({"col": c, "label": str(v)})
        # Experiments + Mean + SD + CV
        experiments = []
        for r in range(7, 20):
            label = ws.cell(row=r, column=2).value
            if label is None: continue
            ls = str(label).strip()
            if "acceptance" in ls.lower() or "criteria" in ls.lower(): break
            vals = {gh["label"]: self._sf(ws.cell(row=r, column=gh["col"]).value) for gh in group_headers}
            experiments.append({"label": ls, "values": vals})
        # Acceptance
        acceptance = None
        for r in range(15, 25):
            v = ws.cell(row=r, column=8).value
            if v and "pass" in str(v).lower():
                acceptance = str(v); break
        return {"available": True, "material_id": ws.cell(row=3, column=1).value, "group_headers": [gh["label"] for gh in group_headers], "experiments": experiments, "acceptance": acceptance}

    # ---- Statistical Analysis ----
    def extract_statistical_analysis(self):
        sheets = self._find_sheets("statistical_analysis") + self._find_sheets("statistical analysis")
        if not sheets: return {"available": False}
        ws = self.wb[sheets[0]]
        # ANOVA summary from rows 24-29
        groups = []
        for r in range(26, 35):
            gname = ws.cell(row=r, column=2).value
            if gname is None: break
            groups.append({"group": str(gname), "count": self._sf(ws.cell(row=r, column=3).value), "sum": self._sf(ws.cell(row=r, column=4).value), "mean": self._sf(ws.cell(row=r, column=5).value), "variance": self._sf(ws.cell(row=r, column=6).value)})
        # ANOVA table from row 33-37
        anova = {}
        for r in range(33, 38):
            src = ws.cell(row=r, column=2).value
            if src is None: continue
            anova[str(src)] = {"ss": self._sf(ws.cell(row=r, column=3).value), "df": self._sf(ws.cell(row=r, column=4).value), "ms": self._sf(ws.cell(row=r, column=5).value), "f_stat": self._sf(ws.cell(row=r, column=6).value), "p_value": self._sf(ws.cell(row=r, column=7).value), "f_crit": self._sf(ws.cell(row=r, column=8).value)}
        # p-value significance
        alpha = self._sf(ws.cell(row=44, column=4).value)
        return {"available": True, "groups_summary": groups, "anova_table": anova, "alpha": alpha}

    def parse_all_data(self):
        try:
            return {"test_details": {"work_package": self.extract_work_package(), "material": self.extract_material(), "cell_line": self.extract_cell_line(), "dispersion": self.extract_dispersion(), "treatment": self.extract_treatment(), "instrumentation": self.extract_instrumentation()}, "replication_metadata": self.extract_replication_metadata(), "replications": self.extract_raw_data(), "processed_data": self.extract_processed_data(), "final_results": self.extract_final_results(), "statistical_analysis": self.extract_statistical_analysis()}
        except Exception as e:
            logger.error(f"Error: {e}\n{traceback.format_exc()}"); raise

def _fix_degree_symbols(obj):
    if isinstance(obj, str): return obj.replace("oC", "\u00b0C")
    if isinstance(obj, dict): return {(k.replace("oC", "\u00b0C") if isinstance(k, str) else k): _fix_degree_symbols(v) for k, v in obj.items()}
    if isinstance(obj, list): return [_fix_degree_symbols(v) for v in obj]
    return obj

def parse_excel_ros(file_path, sheet_name="Test_conditions"):
    return _fix_degree_symbols(ROSParser(file_path, sheet_name).parse_all_data())

if __name__ == "__main__":
    import sys
    fp = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads/CMS_WP3_ROS_1a_n1_FINAL.xlsx"
    d = parse_excel_ros(fp)
    print("=" * 70); print("ROS PARSER OUTPUT SUMMARY"); print("=" * 70)
    wp = d["test_details"]["work_package"]; mat = d["test_details"]["material"]
    print(f"WP: {wp['wp_name']}, Test: {wp['test_acronym']}, Material: {mat['material_identifier']}")
    print(f"Replication metadata: {len(d['replication_metadata'])}")
    for rm in d["replication_metadata"]: print(f"  {rm['test_identifier_number']}: {rm['test_start_date']}")
    print(f"Raw blocks: {len(d['replications'])}")
    for b in d["replications"]: print(f"  {b['run_label']}: {b['reading_count']} readings")
    print(f"Processed blocks: {len(d['processed_data'])}")
    for b in d["processed_data"]: print(f"  {b['run_label']}: groups={b['group_headers']}, acceptance={b['acceptance']}")
    fr = d["final_results"]
    print(f"Final results: available={fr['available']}, acceptance={fr.get('acceptance')}")
    if fr.get("experiments"):
        for e in fr["experiments"]: print(f"  {e['label']}: {e['values']}")
    sa = d["statistical_analysis"]
    print(f"Statistical analysis: available={sa['available']}")
    if sa.get("groups_summary"):
        for g in sa["groups_summary"]: print(f"  {g['group']}: mean={g['mean']}")