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


@dataclass
class Scientist:
    name: Optional[str] = None
    email: Optional[str] = None


@dataclass
class WorkPackageData:
    wp_name: Optional[str] = None
    partner: Optional[str] = None
    laboratory_name: Optional[str] = None
    full_test_name: Optional[str] = None
    test_acronym: Optional[str] = None
    test_type: Optional[str] = None
    endpoint: Optional[str] = None
    endpoint_outcome: Optional[str] = None
    sop: Optional[str] = None
    path: Optional[str] = None
    lead_scientists: List[Scientist] = field(default_factory=list)
    assay_scientists: List[Scientist] = field(default_factory=list)


@dataclass
class MaterialData:
    material_identifier: Optional[str] = None
    erm_id: Optional[str] = None
    material_name: Optional[str] = None
    core_chemistry: Optional[str] = None
    cas_no: Optional[str] = None
    cas_for_core: Optional[str] = None
    material_supplier: Optional[str] = None
    material_state: Optional[str] = None
    batch: Optional[str] = None
    vial: Optional[str] = None
    preparation_date: Optional[str] = None
    size: Optional[str] = None
    endotoxin_absent: Optional[str] = None
    stock_concentration: Optional[str] = None
    molecular_weight: Optional[str] = None
    particles_stock: Optional[str] = None


@dataclass
class CellLineData:
    cell_type_specification: Optional[str] = None
    cell_line_short_name: Optional[str] = None
    supplier: Optional[str] = None
    passage_numbers: Dict[str, Optional[Union[int, str]]] = field(default_factory=dict)
    plate_details: Optional[str] = None
    cells_per_well: Optional[Union[int, str]] = None
    volume_per_well: Optional[str] = None
    medium: Optional[str] = None
    serum: Optional[str] = None
    serum_concentration_culture: Optional[Union[float, str]] = None
    serum_concentration_treatment: Optional[str] = None
    serum_heat_inactivated: Optional[str] = None
    antibiotics: Optional[str] = None
    complete_growth_medium: Optional[str] = None
    culture_conditions: Optional[str] = None
    solvent_for_dcfda: Optional[str] = None
    incubation_time_dcfda: Optional[str] = None
    volume_of_solvent: Optional[str] = None


@dataclass
class DispersionData:
    dispersion_protocol: Optional[str] = None
    dispersion_technique: Optional[str] = None
    dispersion_agent: Optional[str] = None
    dispersion_agent_concentration: Optional[str] = None
    additives: Optional[str] = None
    dispersed_in_culture_medium: Optional[str] = None
    aids_used_to_disperse: Optional[str] = None
    sonication_bath: Optional[str] = None
    sonication_tip: Optional[str] = None
    time_duration: Optional[str] = None
    energy: Optional[str] = None


@dataclass
class TreatmentTimeline:
    time_point_unit: Optional[str] = None
    time_point_labels: List[str] = field(default_factory=list)
    time_points: List[str] = field(default_factory=list)


@dataclass
class TreatmentConcentration:
    unit: Optional[str] = None
    labels: List[str] = field(default_factory=list)
    concentrations_ugml: List[Union[float, str]] = field(default_factory=list)
    concentrations_particles: List[Union[float, str]] = field(default_factory=list)
    plate_series: List[str] = field(default_factory=list)
    positive_control_abbr: Optional[str] = None
    positive_control_desc: Optional[str] = None
    negative_control_abbr: Optional[str] = None
    negative_control_desc: Optional[str] = None
    number_of_experiments: Optional[int] = None


@dataclass
class ReplicationData:
    test_identifier_number: Optional[str] = None
    test_start_date: Optional[str] = None
    test_end_date: Optional[str] = None
    replicate_label: Optional[str] = None


@dataclass
class ROSRawExperiment:
    experiment_label: Optional[str] = None
    cytometric_events: Optional[int] = None
    concentrations: List[str] = field(default_factory=list)
    values: List[Optional[float]] = field(default_factory=list)


@dataclass
class ROSRawDataBlock:
    metric_name: Optional[str] = None
    concentrations: List[str] = field(default_factory=list)
    experiments: List[ROSRawExperiment] = field(default_factory=list)


@dataclass
class ROSDataAnalysisBlock:
    metric_name: Optional[str] = None
    filter_label: Optional[str] = None
    concentrations: List[Union[float, str]] = field(default_factory=list)
    concentration_unit: Optional[str] = None
    experiments: List[Dict[str, Any]] = field(default_factory=list)
    mean: List[Optional[float]] = field(default_factory=list)
    sd: List[Optional[float]] = field(default_factory=list)
    cv: List[Optional[float]] = field(default_factory=list)
    cv_acceptance: Optional[str] = None
    cytometric_events_acceptance: Optional[str] = None


@dataclass
class ROSExperiment5Data:
    concentrations: List[str] = field(default_factory=list)
    values: List[Optional[float]] = field(default_factory=list)
    cytometric_events: List[Optional[int]] = field(default_factory=list)


@dataclass
class ROSMeanDataBlock:
    metric_name: Optional[str] = None
    concentration_unit: Optional[str] = None
    concentrations: List[Union[float, str]] = field(default_factory=list)
    experiments: List[Dict[str, Any]] = field(default_factory=list)
    mean: List[Optional[float]] = field(default_factory=list)
    sd: List[Optional[float]] = field(default_factory=list)


@dataclass
class ANOVASummaryRow:
    grupy: Optional[str] = None
    licznik: Optional[int] = None
    suma: Optional[float] = None
    srednia: Optional[float] = None
    wariancja: Optional[float] = None


@dataclass
class ANOVATableRow:
    zrodlo_wariancji: Optional[str] = None
    ss: Optional[float] = None
    df: Optional[int] = None
    ms: Optional[float] = None
    f_value: Optional[float] = None
    p_value: Optional[float] = None
    f_critical: Optional[float] = None


@dataclass
class ANOVAResult:
    metric_name: Optional[str] = None
    summary: List[ANOVASummaryRow] = field(default_factory=list)
    anova_table: List[ANOVATableRow] = field(default_factory=list)
    total_ss: Optional[float] = None
    total_df: Optional[int] = None
    p_value_significant: Optional[bool] = None
    alpha: Optional[float] = None


@dataclass
class PostHocComparison:
    groups: Optional[str] = None
    p_value: Optional[float] = None
    significant: Optional[str] = None


@dataclass
class PostHocBlock:
    anova_alpha: Optional[float] = None
    bonferroni_alpha: Optional[float] = None
    significance_symbol: Optional[str] = None
    comparisons: List[PostHocComparison] = field(default_factory=list)


@dataclass
class PostHocResult:
    metric_name: Optional[str] = None
    blocks: List[PostHocBlock] = field(default_factory=list)


@dataclass
class StatisticalAnalysisData:
    fluorescence_sum_anova: Optional[ANOVAResult] = None
    fluorescence_sum_posthoc: Optional[PostHocResult] = None
    percentage_high_ros_anova: Optional[ANOVAResult] = None
    percentage_high_ros_posthoc: Optional[PostHocResult] = None


class ROSParser:
    def __init__(self, file_path: str, sheet_name: str = "Test_conditions"):
        self.file_path = file_path
        self.sheet_name = sheet_name
        try:
            self.wb = openpyxl.load_workbook(file_path, data_only=True)
            self.ws = self.wb[sheet_name]
            logger.info(f"Successfully loaded Excel file: {file_path}")
        except Exception as e:
            logger.error(f"Failed to load workbook or sheet {sheet_name}: {e}")
            raise

        self.email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        self.spelling_issues: List[Dict[str, str]] = []

    def normalize_key(self, key: Optional[str]) -> Optional[str]:
        if key:
            normalized = str(key).strip().lower()
            normalized = re.sub(r"[^a-z0-9]", "_", normalized)
            normalized = re.sub(r"_+", "_", normalized).strip("_")
            return normalized
        return None

    def excel_date_to_string(self, value) -> Optional[str]:
        try:
            if isinstance(value, datetime):
                return value.strftime("%Y-%m-%d")

            if isinstance(value, (int, float)):
                base_date = datetime(1899, 12, 30)
                delta = timedelta(days=float(value))
                return (base_date + delta).strftime("%Y-%m-%d")

            if isinstance(value, str):
                if re.match(r"^\d{1,2}\.\d{1,2}\.\d{1,2}-\d{2}$", value):
                    self.spelling_issues.append({
                        "type": "malformed_date",
                        "value": value,
                        "note": f"Malformed date string: '{value}'.",
                    })
                    return value

                for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y"]:
                    try:
                        return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
                    except ValueError:
                        pass

            return str(value) if value else None
        except Exception as e:
            logger.warning(f"Failed to convert date {value}: {e}")
            return str(value) if value else None

    def _get_value(self, row, col_range=range(1, 5)):
        for col_idx in col_range:
            if col_idx < len(row) and row[col_idx].value is not None:
                return row[col_idx].value
        return None

    def _safe_float(self, value) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _safe_int(self, value) -> Optional[int]:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

    def _check_spelling(self, raw_key: str, row_idx: int):
        known_typos = {
            "stock_oncentration": ("stock_concentration", "Missing 'c' in 'concentration'"),
        }
        nk = self.normalize_key(raw_key)
        if nk in known_typos:
            dedup_key = (row_idx, nk)
            existing = {
                (issue.get("row"), self.normalize_key(issue.get("found", "")))
                for issue in self.spelling_issues
                if issue.get("type") == "spelling_error"
            }
            if dedup_key not in existing:
                correct, note = known_typos[nk]
                self.spelling_issues.append({
                    "type": "spelling_error",
                    "row": row_idx,
                    "found": raw_key.strip(),
                    "expected": correct,
                    "note": note,
                })

    def extract_work_package_data(self) -> Dict[str, Any]:
        ws = self.wb["Test_conditions"]
        data = []
        lead_scientists = []
        assay_scientists = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_col=5), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue

            raw_key = str(key_cell)
            self._check_spelling(raw_key, row_idx)
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value_cell = self._get_value(row)
            email_cell = row[3].value if len(row) > 3 else None

            entry = {"Key": key, "Value": value_cell}
            if email_cell and re.match(self.email_regex, str(email_cell)):
                entry["Email"] = email_cell
            data.append(entry)

            if "lead_scientist" in key:
                lead_scientists.append(Scientist(name=value_cell, email=email_cell))

            if "assay_test_work_conducted_by" in key:
                assay_scientists.append(Scientist(name=value_cell, email=email_cell))

        wp_data = WorkPackageData(
            wp_name=next((d["Value"] for d in data if d["Key"] == "project_work_package"), None),
            partner=next((d["Value"] for d in data if d["Key"] == "partner_conducting_test_assay"), None),
            laboratory_name=next((d["Value"] for d in data if d["Key"] == "test_facility_laboratory_name"), None),
            full_test_name=next((d["Value"] for d in data if "full_name_of_test_assay" in d["Key"]), None),
            test_acronym=next((d["Value"] for d in data if "short_name_or_acronym" in d["Key"]), None),
            test_type=next((d["Value"] for d in data if "type_or_class_of_experimental" in d["Key"]), None),
            endpoint=next((d["Value"] for d in data if "end_point_being_investigated" in d["Key"]), None),
            endpoint_outcome=next((d["Value"] for d in data if "metric_s_used_to_assess" in d["Key"]), None),
            sop=next((d["Value"] for d in data if "sop_s_for_test" in d["Key"]), None),
            path=next((d["Value"] for d in data if "path_link_to_sop" in d["Key"]), None),
            lead_scientists=lead_scientists,
            assay_scientists=assay_scientists,
        )
        return asdict(wp_data)

    def extract_material_data(self) -> Dict[str, Any]:
        ws = self.wb["Test_conditions"]
        data = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_col=5), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue

            raw_key = str(key_cell)
            self._check_spelling(raw_key, row_idx)
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value = self._get_value(row)
            data.append({"Key": key, "Value": value})

        material_data = MaterialData(
            material_identifier=next((d["Value"] for d in data if d["Key"] == "sample_cms_internal_identifier"), None),
            erm_id=next((d["Value"] for d in data if "erm_identifier" in d["Key"]), None),
            material_name=next((d["Value"] for d in data if d["Key"] == "material_name"), None),
            core_chemistry=next((d["Value"] for d in data if "core_chemistry" in d["Key"]), None),
            cas_no=next((d["Value"] for d in data if d["Key"] == "cas_no"), None),
            cas_for_core=next((d["Value"] for d in data if d["Key"] == "cas_for_core"), None),
            material_supplier=next((d["Value"] for d in data if d["Key"] == "material_supplier"), None),
            material_state=next((d["Value"] for d in data if d["Key"] == "material_state"), None),
            batch=next((d["Value"] for d in data if d["Key"] == "batch"), None),
            vial=next((d["Value"] for d in data if d["Key"] == "vial"), None),
            preparation_date=self.excel_date_to_string(
                next((d["Value"] for d in data if "date_of_preparation" in d["Key"]), None)
            ),
            size=next((d["Value"] for d in data if d["Key"] == "size"), None),
            endotoxin_absent=next((d["Value"] for d in data if "endotoxin" in d["Key"]), None),
            stock_concentration=next(
                (d["Value"] for d in data if "stock" in d["Key"] and "oncentration" in d["Key"]),
                None,
            ),
            molecular_weight=next((d["Value"] for d in data if "molecular_weight" in d["Key"]), None),
            particles_stock=next(
                (d["Value"] for d in data if "particles_in_stock" in d["Key"] or "no_of_particles" in d["Key"]),
                None,
            ),
        )
        return asdict(material_data)

    def extract_cell_line_data(self) -> Dict[str, Any]:
        ws = self.wb["Test_conditions"]
        data = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_col=6), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue

            key = self.normalize_key(str(key_cell))
            if not key:
                continue

            value = self._get_value(row)
            data.append({"Key": key, "Value": value, "Row": row_idx})

        passage_numbers = {}
        passage_row = 63
        for col_idx in range(2, 7):
            header = ws.cell(row=62, column=col_idx).value
            val = ws.cell(row=passage_row, column=col_idx).value
            if header and val is not None:
                passage_numbers[str(header)] = val

        cell_line = CellLineData(
            cell_type_specification=next((d["Value"] for d in data if "detailed_cell_type" in d["Key"]), None),
            cell_line_short_name=next((d["Value"] for d in data if "cell_line_short_name" in d["Key"]), None),
            supplier=next((d["Value"] for d in data if d["Key"] == "supplier" and d["Row"] >= 58), None),
            passage_numbers=passage_numbers,
            plate_details=next((d["Value"] for d in data if "plate_details" in d["Key"]), None),
            cells_per_well=next((d["Value"] for d in data if "number_of_cells_per_well" in d["Key"]), None),
            volume_per_well=next((d["Value"] for d in data if "total_volume_per_well" in d["Key"]), None),
            medium=next((d["Value"] for d in data if d["Key"] == "medium_supplier_lot_no"), None),
            serum=next((d["Value"] for d in data if "serum_inc" in d["Key"] or d["Key"] == "serum_inc_supplier_lot_no"), None),
            serum_concentration_culture=next((d["Value"] for d in data if "serum_concentration_in_culture" in d["Key"]), None),
            serum_concentration_treatment=next((d["Value"] for d in data if "serum_concentration_in_treatment" in d["Key"]), None),
            serum_heat_inactivated=next((d["Value"] for d in data if "heat_inactivated" in d["Key"]), None),
            antibiotics=next((d["Value"] for d in data if "antibiotics" in d["Key"]), None),
            complete_growth_medium=next((d["Value"] for d in data if "complete_growth_medium" in d["Key"]), None),
            culture_conditions=next((d["Value"] for d in data if "cell_culture_conditions" in d["Key"]), None),
            solvent_for_dcfda=next((d["Value"] for d in data if "solvent_for_da_dfc" in d["Key"]), None),
            incubation_time_dcfda=next((d["Value"] for d in data if "incubation_time_with_da_dfc" in d["Key"]), None),
            volume_of_solvent=next((d["Value"] for d in data if "volume_of_solvent" in d["Key"]), None),
        )
        return asdict(cell_line)

    def extract_dispersion_data(self) -> Dict[str, Any]:
        ws = self.wb["Test_conditions"]
        data = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=49, max_row=57, max_col=6), start=49):
            key_cell = row[0].value
            if not key_cell:
                continue

            key = self.normalize_key(str(key_cell))
            value = self._get_value(row)
            data.append({"Key": key, "Value": value, "Row": row_idx})

        dispersion_agent = ws.cell(row=52, column=2).value
        dispersion_agent_conc = ws.cell(row=52, column=4).value
        sonication_bath = ws.cell(row=55, column=4).value
        sonication_tip = ws.cell(row=55, column=6).value if ws.max_column >= 6 else None

        dispersion = DispersionData(
            dispersion_protocol=next((d["Value"] for d in data if "standard_dispersion_protocol" in d["Key"]), None),
            dispersion_technique=next((d["Value"] for d in data if "dispersion_technique" in d["Key"]), None),
            dispersion_agent=dispersion_agent,
            dispersion_agent_concentration=dispersion_agent_conc,
            additives=next((d["Value"] for d in data if "additives" in d["Key"]), None),
            dispersed_in_culture_medium=next((d["Value"] for d in data if "dispersed_in_cell_culture" in d["Key"]), None),
            aids_used_to_disperse=next((d["Value"] for d in data if "aids_used_to_disperse" in d["Key"]), None),
            sonication_bath=sonication_bath,
            sonication_tip=sonication_tip,
            time_duration=next((d["Value"] for d in data if "time_duration" in d["Key"] or "specify_time" in d["Key"]), None),
            energy=next((d["Value"] for d in data if "energy" in d["Key"]), None),
        )
        return asdict(dispersion)

    def extract_treatment_data(self) -> Dict[str, Any]:
        ws = self.wb["Test_conditions"]

        time_point_unit = ws.cell(row=79, column=2).value
        time_labels = [
            ws.cell(row=80, column=c).value
            for c in range(2, ws.max_column + 1)
            if ws.cell(row=80, column=c).value is not None
        ]
        time_points = [
            ws.cell(row=81, column=c).value
            for c in range(2, ws.max_column + 1)
            if ws.cell(row=81, column=c).value is not None
        ]

        timeline = asdict(TreatmentTimeline(
            time_point_unit=time_point_unit,
            time_point_labels=time_labels,
            time_points=time_points,
        ))

        conc_unit = ws.cell(row=83, column=2).value
        labels = [
            ws.cell(row=84, column=c).value
            for c in range(2, ws.max_column + 1)
            if ws.cell(row=84, column=c).value is not None
        ]
        conc_ugml = [
            ws.cell(row=85, column=c).value
            for c in range(2, ws.max_column + 1)
            if ws.cell(row=85, column=c).value is not None
        ]
        conc_particles = [
            ws.cell(row=86, column=c).value
            for c in range(2, ws.max_column + 1)
            if ws.cell(row=86, column=c).value is not None
        ]
        plate_series = [
            ws.cell(row=87, column=c).value
            for c in range(2, ws.max_column + 1)
            if ws.cell(row=87, column=c).value is not None
        ]

        concentration = asdict(TreatmentConcentration(
            unit=conc_unit,
            labels=labels,
            concentrations_ugml=conc_ugml,
            concentrations_particles=conc_particles,
            plate_series=plate_series,
            positive_control_abbr=ws.cell(row=88, column=2).value,
            positive_control_desc=ws.cell(row=89, column=2).value,
            negative_control_abbr=ws.cell(row=90, column=2).value,
            negative_control_desc=ws.cell(row=91, column=2).value,
            number_of_experiments=ws.cell(row=92, column=2).value,
        ))

        return {"timeline": timeline, "concentration": concentration}

    def extract_replications(self) -> List[Dict[str, Any]]:
        ws = self.wb["Test_conditions"]
        replications = []

        for row_idx in range(39, 44):
            test_id = ws.cell(row=row_idx, column=2).value
            if test_id is None:
                continue

            start_date = self.excel_date_to_string(ws.cell(row=row_idx, column=3).value)
            end_date = self.excel_date_to_string(ws.cell(row=row_idx, column=4).value)
            replicate_label = ws.cell(row=row_idx, column=5).value

            replications.append(asdict(ReplicationData(
                test_identifier_number=test_id,
                test_start_date=start_date,
                test_end_date=end_date,
                replicate_label=replicate_label,
            )))

        return replications

    def _extract_raw_block(self, ws, header_col_start, header_col_end, data_rows, metric_name) -> Dict[str, Any]:
        concentrations = []
        for col_idx in range(header_col_start, header_col_end + 1):
            v = ws.cell(row=5, column=col_idx).value
            if v is not None:
                concentrations.append(str(v))

        experiments = []
        row_idx = 6
        while row_idx <= data_rows:
            exp_label = ws.cell(row=row_idx, column=1).value
            if exp_label is None:
                row_idx += 1
                continue

            exp_label_str = str(exp_label).strip()
            if not exp_label_str.lower().startswith("experiment"):
                row_idx += 1
                continue

            values = []
            for col_idx in range(header_col_start, header_col_start + len(concentrations)):
                v = ws.cell(row=row_idx, column=col_idx).value
                values.append(self._safe_float(v))

            events_row = row_idx + 1
            events_val = None
            for col_idx in range(header_col_start, header_col_start + len(concentrations)):
                ev = ws.cell(row=events_row, column=col_idx).value
                if ev is not None:
                    events_val = self._safe_int(ev)
                    break

            experiments.append(asdict(ROSRawExperiment(
                experiment_label=exp_label_str,
                cytometric_events=events_val,
                concentrations=concentrations,
                values=values,
            )))
            row_idx += 2

        return asdict(ROSRawDataBlock(
            metric_name=metric_name,
            concentrations=concentrations,
            experiments=experiments,
        ))

    def extract_raw_data(self) -> List[Dict[str, Any]]:
        ws = self.wb["Raw_data"]

        block1 = self._extract_raw_block(
            ws,
            header_col_start=3,
            header_col_end=16,
            data_rows=15,
            metric_name="Sum of percent of fluorescence as a parameter of the level of free radicals",
        )

        block2 = self._extract_raw_block(
            ws,
            header_col_start=22,
            header_col_end=30,
            data_rows=15,
            metric_name="Percentage of cells with high fluorescence (high ROS levels)",
        )

        return [block1, block2]

    def _extract_analysis_block(
        self,
        ws,
        label_col,
        data_col_start,
        data_col_end,
        unit_col,
        metric_name,
        filter_label,
    ) -> Dict[str, Any]:
        concentrations = []
        for col_idx in range(data_col_start, data_col_end + 1):
            v = ws.cell(row=6, column=col_idx).value
            if v is not None:
                concentrations.append(v)

        conc_unit = ws.cell(row=6, column=unit_col).value

        experiments = []
        for exp_row in [7, 9, 11]:
            exp_label = ws.cell(row=exp_row, column=label_col).value
            if exp_label is None:
                continue

            values = {}
            for idx, conc in enumerate(concentrations):
                col = data_col_start + idx
                values[str(conc)] = ws.cell(row=exp_row, column=col).value

            experiments.append({
                "label": str(exp_label),
                "values": values,
            })

        mean_vals = [ws.cell(row=13, column=data_col_start + i).value for i in range(len(concentrations))]
        sd_vals = [ws.cell(row=14, column=data_col_start + i).value for i in range(len(concentrations))]
        cv_vals = [ws.cell(row=15, column=data_col_start + i).value for i in range(len(concentrations))]

        cv_acceptance = None
        for col_idx in range(data_col_start, data_col_end + 3):
            v = ws.cell(row=18, column=col_idx).value
            if v in ("PASSED", "FAILED"):
                cv_acceptance = v
                break

        events_acceptance = None
        for col_idx in range(data_col_start, data_col_end + 3):
            v = ws.cell(row=21, column=col_idx).value
            if v in ("PASSED", "FAILED"):
                events_acceptance = v
                break

        return asdict(ROSDataAnalysisBlock(
            metric_name=metric_name,
            filter_label=filter_label,
            concentrations=concentrations,
            concentration_unit=conc_unit,
            experiments=experiments,
            mean=mean_vals,
            sd=sd_vals,
            cv=cv_vals,
            cv_acceptance=cv_acceptance,
            cytometric_events_acceptance=events_acceptance,
        ))

    def extract_data_analysis(self) -> Dict[str, Any]:
        ws = self.wb["Data_Analysis"]

        block1 = self._extract_analysis_block(
            ws,
            label_col=2,
            data_col_start=3,
            data_col_end=11,
            unit_col=12,
            metric_name="Sum of percent of fluorescence",
            filter_label=ws.cell(row=4, column=2).value,
        )

        block2 = self._extract_analysis_block(
            ws,
            label_col=28,
            data_col_start=29,
            data_col_end=37,
            unit_col=38,
            metric_name="Percentage of cells with high fluorescence (high ROS levels)",
            filter_label=ws.cell(row=4, column=28).value,
        )

        exp5_concentrations = []
        exp5_values = []
        exp5_events = []

        for col_idx in range(1, 10):
            conc = ws.cell(row=58, column=col_idx).value
            val = ws.cell(row=59, column=col_idx).value
            ev = ws.cell(row=60, column=col_idx).value

            if conc is not None:
                exp5_concentrations.append(str(conc))
                exp5_values.append(self._safe_float(val))
                exp5_events.append(self._safe_int(ev))

        experiment_5 = asdict(ROSExperiment5Data(
            concentrations=exp5_concentrations,
            values=exp5_values,
            cytometric_events=exp5_events,
        ))

        return {
            "fluorescence_sum": block1,
            "percentage_high_ros": block2,
            "experiment_5_separate": experiment_5,
        }

    def _extract_mean_block(self, ws, label_col, data_col_start, num_concs, unit_col, metric_name) -> Dict[str, Any]:
        concentrations = []
        for col_idx in range(data_col_start, data_col_start + num_concs):
            v = ws.cell(row=6, column=col_idx).value
            if v is not None:
                concentrations.append(v)

        conc_unit = ws.cell(row=6, column=unit_col).value

        experiments = []
        for exp_row in [7, 8, 9]:
            exp_label = ws.cell(row=exp_row, column=label_col).value
            if exp_label is None:
                continue

            values = {}
            for idx, conc in enumerate(concentrations):
                col = data_col_start + idx
                values[str(conc)] = ws.cell(row=exp_row, column=col).value

            experiments.append({
                "label": str(exp_label),
                "values": values,
            })

        mean_vals = [ws.cell(row=13, column=data_col_start + i).value for i in range(len(concentrations))]
        sd_vals = [ws.cell(row=14, column=data_col_start + i).value for i in range(len(concentrations))]

        return asdict(ROSMeanDataBlock(
            metric_name=metric_name,
            concentration_unit=conc_unit,
            concentrations=concentrations,
            experiments=experiments,
            mean=mean_vals,
            sd=sd_vals,
        ))

    def extract_mean_data(self) -> List[Dict[str, Any]]:
        ws = self.wb["Mean_data"]

        block1 = self._extract_mean_block(
            ws,
            label_col=2,
            data_col_start=4,
            num_concs=9,
            unit_col=13,
            metric_name="Sum of percent of fluorescence (µg/mL)",
        )

        block2 = self._extract_mean_block(
            ws,
            label_col=17,
            data_col_start=19,
            num_concs=9,
            unit_col=28,
            metric_name="Sum of percent of fluorescence (par. x10^9/mL)",
        )

        block3 = self._extract_mean_block(
            ws,
            label_col=31,
            data_col_start=33,
            num_concs=9,
            unit_col=42,
            metric_name="Percentage of cells with high fluorescence (µg/mL)",
        )

        block4 = self._extract_mean_block(
            ws,
            label_col=46,
            data_col_start=48,
            num_concs=9,
            unit_col=57,
            metric_name="Percentage of cells with high fluorescence (par. x10^9/mL)",
        )

        return [block1, block2, block3, block4]

    def _extract_anova(self, ws, col_offset, metric_name) -> Dict[str, Any]:
        summary = []
        for row_idx in range(26, 35):
            grupy = ws.cell(row=row_idx, column=col_offset).value
            if grupy is None:
                continue

            summary.append(asdict(ANOVASummaryRow(
                grupy=grupy,
                licznik=ws.cell(row=row_idx, column=col_offset + 1).value,
                suma=ws.cell(row=row_idx, column=col_offset + 2).value,
                srednia=ws.cell(row=row_idx, column=col_offset + 3).value,
                wariancja=ws.cell(row=row_idx, column=col_offset + 4).value,
            )))

        anova_table = []
        for row_idx in [39, 40]:
            source = ws.cell(row=row_idx, column=col_offset).value
            if source is None:
                continue

            anova_table.append(asdict(ANOVATableRow(
                zrodlo_wariancji=source,
                ss=ws.cell(row=row_idx, column=col_offset + 1).value,
                df=ws.cell(row=row_idx, column=col_offset + 2).value,
                ms=ws.cell(row=row_idx, column=col_offset + 3).value,
                f_value=ws.cell(row=row_idx, column=col_offset + 4).value,
                p_value=ws.cell(row=row_idx, column=col_offset + 5).value,
                f_critical=ws.cell(row=row_idx, column=col_offset + 6).value,
            )))

        total_ss = ws.cell(row=42, column=col_offset + 1).value
        total_df = ws.cell(row=42, column=col_offset + 2).value
        alpha = ws.cell(row=44, column=col_offset + 2).value
        sig_text = ws.cell(row=45, column=col_offset).value
        p_significant = True if sig_text and str(sig_text).strip().upper() == "YES" else False

        return asdict(ANOVAResult(
            metric_name=metric_name,
            summary=summary,
            anova_table=anova_table,
            total_ss=total_ss,
            total_df=total_df,
            p_value_significant=p_significant,
            alpha=alpha,
        ))

    def _extract_posthoc(self, ws, block_starts, alpha_col_offsets, metric_name) -> Dict[str, Any]:
        blocks = []

        for groups_col, alpha_col in zip(block_starts, alpha_col_offsets):
            anova_alpha = ws.cell(row=55, column=alpha_col + 1).value
            bonferroni_alpha = ws.cell(row=56, column=alpha_col + 1).value
            sig_symbol = ws.cell(row=55, column=alpha_col + 2).value

            comparisons = []
            for row_idx in range(54, 90):
                group_name = ws.cell(row=row_idx, column=groups_col).value
                if group_name is None:
                    continue

                group_str = str(group_name).strip()
                if not group_str.startswith("Group"):
                    continue

                p_val = ws.cell(row=row_idx, column=groups_col + 1).value
                sig = ws.cell(row=row_idx, column=groups_col + 2).value

                comparisons.append(asdict(PostHocComparison(
                    groups=group_str,
                    p_value=p_val,
                    significant=sig,
                )))

            blocks.append(asdict(PostHocBlock(
                anova_alpha=anova_alpha,
                bonferroni_alpha=bonferroni_alpha,
                significance_symbol=sig_symbol,
                comparisons=comparisons,
            )))

        return asdict(PostHocResult(
            metric_name=metric_name,
            blocks=blocks,
        ))

    def extract_statistical_analysis(self) -> Dict[str, Any]:
        ws = self.wb["Statistical analysis"]

        anova_1 = self._extract_anova(
            ws,
            col_offset=2,
            metric_name="Sum of percent of fluorescence",
        )

        posthoc_1 = self._extract_posthoc(
            ws,
            block_starts=[2, 9, 16, 23],
            alpha_col_offsets=[6, 13, 20, 27],
            metric_name="Sum of percent of fluorescence",
        )

        anova_2 = self._extract_anova(
            ws,
            col_offset=32,
            metric_name="Percentage of cells with high fluorescence (high ROS levels)",
        )

        posthoc_2 = self._extract_posthoc(
            ws,
            block_starts=[32, 39, 46, 53],
            alpha_col_offsets=[36, 43, 50, 57],
            metric_name="Percentage of cells with high fluorescence (high ROS levels)",
        )

        return asdict(StatisticalAnalysisData(
            fluorescence_sum_anova=anova_1,
            fluorescence_sum_posthoc=posthoc_1,
            percentage_high_ros_anova=anova_2,
            percentage_high_ros_posthoc=posthoc_2,
        ))

    def parse_all_data(self) -> Dict[str, Union[Dict, List]]:
        """
        Final JSON structure aligned with SIMS/FTIR parsers:
        {
            "test_details": {
                "work_package": {...},
                "material": {...},
                "cell_line": {...},
                "dispersion": {...},
                "treatment": {...}
            },
            "replication_metadata": [...],
            "replications": [...],          # raw data blocks
            "processed_data": {...},        # data analysis
            "final_results": [...],         # mean data (flat, no wrapper)
            "statistical_analysis": {...}
        }
        """
        try:
            work_package_data = self.extract_work_package_data()
            material_data = self.extract_material_data()
            cell_line_data = self.extract_cell_line_data()
            dispersion_data = self.extract_dispersion_data()
            treatment_data = self.extract_treatment_data()

            replication_metadata = self.extract_replications()
            raw_data = self.extract_raw_data()
            data_analysis = self.extract_data_analysis()
            mean_data = self.extract_mean_data()
            statistical_analysis = self.extract_statistical_analysis()

            parsed_data = {
                "test_details": {
                    "work_package": work_package_data,
                    "material": material_data,
                    "cell_line": cell_line_data,
                    "dispersion": dispersion_data,
                    "treatment": treatment_data,
                },
                "replication_metadata": replication_metadata,
                "replications": raw_data,
                "processed_data": data_analysis,
                "final_results": mean_data,
                "statistical_analysis": statistical_analysis,
            }

            if self.spelling_issues:
                parsed_data["parser_warnings"] = self.spelling_issues

            logger.info("FINAL ROS JSON:\n%s", json.dumps(parsed_data, indent=2, default=str))
            return parsed_data

        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}\n{traceback.format_exc()}")
            raise


def parse_excel_ros(file_path: str, sheet_name: str = "Test_conditions") -> Dict[str, Union[Dict, List]]:
    try:
        parser = ROSParser(file_path, sheet_name)
        return parser.parse_all_data()
    except Exception as e:
        logger.error(f"Error in parse_excel_ros: {e}\n{traceback.format_exc()}")
        raise


if __name__ == "__main__":
    file_path = "/Users/ayushkhandelwal/Documents/chemat-sustain/backend/data/CMS_WP3_ROS_1a_FINAL.xlsx"
    parsed_data = parse_excel_ros(file_path)

    print("=" * 70)
    print("ROS PARSER OUTPUT SUMMARY")
    print("=" * 70)

    print("\n--- Test Details ---")
    wp = parsed_data["test_details"]["work_package"]
    print(f"WP: {wp['wp_name']}, Partner: {wp['partner']}")
    print(f"Test: {wp['test_acronym']} - {wp['full_test_name']}")
    print(f"Lead Scientists: {[s['name'] for s in wp['lead_scientists']]}")

    print(f"\n--- Replication Metadata ({len(parsed_data['replication_metadata'])}) ---")
    for r in parsed_data["replication_metadata"]:
        print(f"  {r['test_identifier_number']}: {r['test_start_date']} to {r['test_end_date']} ({r['replicate_label']})")

    print(f"\n--- Raw Data / Replications ({len(parsed_data['replications'])}) ---")
    for block in parsed_data["replications"]:
        print(f"  {block['metric_name'][:60]}...")
        print(f"    Concentrations: {block['concentrations']}")
        print(f"    Experiments: {len(block['experiments'])}")

    print(f"\n--- Processed Data ---")
    for key in ["fluorescence_sum", "percentage_high_ros"]:
        da = parsed_data["processed_data"][key]
        print(f"  {da['metric_name'][:50]}: CV={da['cv_acceptance']}, Events={da['cytometric_events_acceptance']}")

    exp5 = parsed_data["processed_data"]["experiment_5_separate"]
    print(f"  Experiment 5: {len(exp5['concentrations'])} concentrations")

    print(f"\n--- Final Results / Mean Data ({len(parsed_data['final_results'])}) ---")
    for md in parsed_data["final_results"]:
        print(f"  {md['metric_name'][:60]}")

    print(f"\n--- Statistical Analysis ---")
    sa = parsed_data["statistical_analysis"]
    for metric_key in ["fluorescence_sum_anova", "percentage_high_ros_anova"]:
        anova = sa[metric_key]
        print(f"  {anova['metric_name'][:50]}: p-significant={anova['p_value_significant']}")

    if "parser_warnings" in parsed_data:
        print(f"\n--- Parser Warnings ({len(parsed_data['parser_warnings'])}) ---")
        for w in parsed_data["parser_warnings"]:
            print(f"  [{w['type']}] {w.get('note', '')}")

    print("\n--- JSON Preview ---")
    print(json.dumps(parsed_data, indent=2, default=str)[:4000])