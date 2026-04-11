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


# =========================================================
# Dataclasses
# =========================================================

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
    catalog_number: Optional[str] = None
    material_state: Optional[str] = None
    batch: Optional[str] = None
    vial: Optional[str] = None
    preparation_date: Optional[str] = None
    molar_concentration: Optional[str] = None
    particles_stock: Optional[str] = None


@dataclass
class DispersionData:
    dispersion_protocol: Optional[str] = None
    dispersion_technique: Optional[str] = None
    dispersion_medium: Optional[str] = None
    sonicator_type: Optional[str] = None
    power_w: Optional[str] = None
    sonication_time_s: Optional[str] = None
    tip_thickness_mm: Optional[str] = None
    tip_composition: Optional[str] = None
    bath_volume_dm3: Optional[str] = None
    sample_volume: Optional[str] = None
    final_concentration: Optional[str] = None
    additional_info: Optional[str] = None


@dataclass
class InstrumentationData:
    instrument_model: Optional[str] = None
    crucible_type: Optional[str] = None
    replication_count: Optional[Union[int, str]] = None
    replicate_labels: List[str] = field(default_factory=list)
    sample_masses: List[Dict[str, Optional[str]]] = field(default_factory=list)
    protective_atmosphere: Optional[str] = None
    temperature_range: Optional[str] = None
    heating_speed: Optional[str] = None


@dataclass
class ReplicationMetadata:
    test_identifier_number: Optional[str] = None
    test_start_date: Optional[str] = None
    test_end_date: Optional[str] = None
    replicate_label: Optional[str] = None
    raw_sheet_name: Optional[str] = None
    processed_sheet_name: Optional[str] = None


@dataclass
class DSCDataPoint:
    time_min: Optional[float] = None
    temperature_c: Optional[float] = None
    heat_flow_mw_per_mg: Optional[float] = None


@dataclass
class DSCRawDataBlock:
    metric_name: Optional[str] = None
    raw_sheet_name: Optional[str] = None
    time_unit: Optional[str] = "min"
    temperature_unit: Optional[str] = "°C"
    heat_flow_unit: Optional[str] = "mW/mg"
    point_count: Optional[int] = None
    min_time_min: Optional[float] = None
    max_time_min: Optional[float] = None
    min_temperature_c: Optional[float] = None
    max_temperature_c: Optional[float] = None
    min_heat_flow: Optional[float] = None
    max_heat_flow: Optional[float] = None
    data_points: List[DSCDataPoint] = field(default_factory=list)


@dataclass
class DSCThermalEvent:
    event_name: Optional[str] = None
    enthalpy_j_per_g: Optional[float] = None
    onset_temperature_c: Optional[Union[float, str]] = None
    standard_deviation_pct: Optional[Union[float, str]] = None
    character: Optional[str] = None


# =========================================================
# Parser
# =========================================================

class DSCParser:
    def __init__(self, file_path: str, sheet_name: str = "Test Information"):
        self.file_path = file_path
        self.sheet_name = sheet_name
        self.parser_warnings: List[Dict[str, Any]] = []

        try:
            self.wb = openpyxl.load_workbook(file_path, data_only=True)
            self.ws = self.wb[sheet_name]
            logger.info("Successfully loaded DSC workbook: %s", file_path)
        except Exception as e:
            logger.error("Failed to load workbook or sheet '%s': %s", sheet_name, e)
            raise

        self.email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

    # -----------------------------------------------------
    # Generic helpers
    # -----------------------------------------------------
    def normalize_key(self, key: Optional[str]) -> Optional[str]:
        if key is None:
            return None
        normalized = str(key).strip().lower()
        normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
        normalized = re.sub(r"_+", "_", normalized).strip("_")
        return normalized

    def excel_date_to_string(self, value) -> Optional[str]:
        try:
            if isinstance(value, datetime):
                return value.strftime("%Y-%m-%d")

            if isinstance(value, (int, float)):
                base_date = datetime(1899, 12, 30)
                return (base_date + timedelta(days=float(value))).strftime("%Y-%m-%d")

            if isinstance(value, str):
                for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y"):
                    try:
                        return datetime.strptime(value.strip(), fmt).strftime("%Y-%m-%d")
                    except ValueError:
                        pass

            return str(value).strip() if value not in (None, "") else None
        except Exception as e:
            logger.warning("Failed to convert date '%s': %s", value, e)
            return str(value).strip() if value not in (None, "") else None

    def _safe_float(self, value) -> Optional[float]:
        if value in (None, ""):
            return None
        try:
            if isinstance(value, str):
                value = value.replace(",", ".").strip()
            return float(value)
        except (ValueError, TypeError):
            return None

    def _get_first_value_in_row(self, row, start_col: int = 2, end_col: int = 6):
        for col_idx in range(start_col, end_col + 1):
            if col_idx - 1 < len(row):
                value = row[col_idx - 1].value
                if value is not None:
                    return value
        return None

    def _sheet_key_values(self) -> List[Dict[str, Any]]:
        data = []
        for row_idx, row in enumerate(self.ws.iter_rows(min_row=1, max_col=6), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue

            raw_key = str(key_cell).strip()
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value = self._get_first_value_in_row(row, 2, 6)
            email = row[3].value if len(row) > 3 else None

            data.append({
                "row": row_idx,
                "raw_key": raw_key,
                "key": key,
                "value": value,
                "email": email,
            })
        return data

    def _find_raw_sheets(self) -> List[str]:
        return sorted([
            s for s in self.wb.sheetnames
            if s.lower().startswith("raw data") or s.lower().startswith("raw_data")
        ])

    def _find_final_results_sheets(self) -> List[str]:
        return sorted([
            s for s in self.wb.sheetnames
            if s.lower().startswith("final results") or s.lower().startswith("final_results")
        ])

    # -----------------------------------------------------
    # Test details
    # -----------------------------------------------------
    def extract_work_package_data(self) -> Dict[str, Any]:
        rows = self._sheet_key_values()
        lead_scientists: List[Scientist] = []
        assay_scientists: List[Scientist] = []

        for row in rows:
            key = row["key"]
            value = row["value"]
            email = row["email"]

            if "lead_scientist" in key:
                lead_scientists.append(Scientist(
                    name=value,
                    email=email if email and re.match(self.email_regex, str(email)) else None,
                ))
            if "assay_test_work_conducted_by" in key:
                assay_scientists.append(Scientist(
                    name=value,
                    email=email if email and re.match(self.email_regex, str(email)) else None,
                ))

        result = WorkPackageData(
            wp_name=next((r["value"] for r in rows if r["key"] == "project_work_package"), None),
            partner=next((r["value"] for r in rows if r["key"] == "partner_conducting_test_assay"), None),
            laboratory_name=next((r["value"] for r in rows if r["key"] == "test_facility_laboratory_name"), None),
            full_test_name=next((r["value"] for r in rows if "full_name_of_test_assay" in r["key"]), None),
            test_acronym=next((r["value"] for r in rows if "short_name_or_acronym" in r["key"]), None),
            test_type=next((r["value"] for r in rows if "type_or_class_of_experimental" in r["key"]), None),
            endpoint=next((r["value"] for r in rows if "end_point_being_investigated" in r["key"]), None),
            endpoint_outcome=next((r["value"] for r in rows if "metric_s_used_to_assess" in r["key"]), None),
            sop=next((r["value"] for r in rows if "sop_s_for_test" in r["key"]), None),
            path=next((r["value"] for r in rows if "path_link_to_sop" in r["key"]), None),
            lead_scientists=lead_scientists,
            assay_scientists=assay_scientists,
        )
        return asdict(result)

    def extract_material_data(self) -> Dict[str, Any]:
        rows = self._sheet_key_values()

        batch_val = next((r["value"] for r in rows if r["key"] == "batch"), None)
        if batch_val is not None:
            batch_val = str(batch_val)

        result = MaterialData(
            material_identifier=next((r["value"] for r in rows if r["key"] == "sample_cms_internal_identifier"), None),
            erm_id=next((r["value"] for r in rows if "erm_identifier" in r["key"]), None),
            material_name=next((r["value"] for r in rows if r["key"] == "material_name"), None),
            core_chemistry=next((r["value"] for r in rows if "core_chemistry" in r["key"]), None),
            cas_no=next((r["value"] for r in rows if r["key"] == "cas_no"), None),
            cas_for_core=next((r["value"] for r in rows if "cas_for_core" in r["key"] or "cas_no_for_core" in r["key"]), None),
            material_supplier=next((r["value"] for r in rows if r["key"] == "material_supplier"), None),
            catalog_number=next((r["value"] for r in rows if "catalog_number" in r["key"] or "catalogue_number" in r["key"]), None),
            material_state=next((r["value"] for r in rows if r["key"] == "material_state"), None),
            batch=batch_val,
            vial=next((r["value"] for r in rows if r["key"] == "vial"), None),
            preparation_date=self.excel_date_to_string(
                next((r["value"] for r in rows if "date_of_sample_preparation" in r["key"] or "date_of_preparation" in r["key"]), None)
            ),
            molar_concentration=next((r["value"] for r in rows if "molar_concentration" in r["key"]), None),
            particles_stock=next((r["value"] for r in rows if "no_of_particles" in r["key"] or "number_of_particles" in r["key"]), None),
        )
        return asdict(result)

    def extract_dispersion_data(self) -> Dict[str, Any]:
        rows = self._sheet_key_values()

        result = DispersionData(
            dispersion_protocol=next(
                (r["value"] for r in rows if "standard_dispersion_protocol" in r["key"] or "specify_standard_dispersion" in r["key"]),
                None,
            ),
            dispersion_technique=next(
                (r["value"] for r in rows if "dispersion_technique" in r["key"] or "otherwise_specify_dispersion" in r["key"]),
                None,
            ),
            dispersion_medium=next(
                (r["value"] for r in rows if "dispersion_dilution_medium" in r["key"] or "dispersion_medium" in r["key"]),
                None,
            ),
            sonicator_type=next((r["value"] for r in rows if "sonicator" in r["key"] and "type" in r["key"]), None),
            power_w=next((r["value"] for r in rows if r["key"] == "power_w"), None),
            sonication_time_s=next((r["value"] for r in rows if "sonication_time" in r["key"]), None),
            tip_thickness_mm=next((r["value"] for r in rows if "tip_thickness" in r["key"]), None),
            tip_composition=next((r["value"] for r in rows if "tip_composition" in r["key"]), None),
            bath_volume_dm3=next((r["value"] for r in rows if "ultrasonic_bath" in r["key"] or "water_volume" in r["key"]), None),
            sample_volume=next((r["value"] for r in rows if r["key"] == "sample_volume"), None),
            final_concentration=next((r["value"] for r in rows if "final_sample_concentration" in r["key"]), None),
            additional_info=next((r["value"] for r in rows if "additional_information" in r["key"]), None),
        )
        return asdict(result)

    def extract_instrumentation_data(self) -> Dict[str, Any]:
        rows = self._sheet_key_values()
        ws = self.ws

        # Replicate labels from row 61 (cols 3+)
        replicate_labels: List[str] = []
        for col_idx in range(3, 15):
            v = ws.cell(row=61, column=col_idx).value
            if v is not None:
                replicate_labels.append(str(v))

        # Sample masses from rows 62-64
        sample_masses: List[Dict[str, Optional[str]]] = []
        for r in range(62, 65):
            label = ws.cell(row=r, column=1).value
            value = ws.cell(row=r, column=2).value
            if label is not None:
                sample_masses.append({
                    "label": str(label).strip(),
                    "value": str(value).strip() if value is not None else None,
                })

        result = InstrumentationData(
            instrument_model=next(
                (r["value"] for r in rows if "instrumentation" in r["key"] and ("model" in r["key"] or "company" in r["key"])),
                None,
            ),
            crucible_type=next((r["value"] for r in rows if "crucible" in r["key"]), None),
            replication_count=ws.cell(row=61, column=2).value,
            replicate_labels=replicate_labels,
            sample_masses=sample_masses,
            protective_atmosphere=next((r["value"] for r in rows if "protective_atmosphere" in r["key"]), None),
            temperature_range=next((r["value"] for r in rows if "temperature_range" in r["key"]), None),
            heating_speed=next((r["value"] for r in rows if "heating_speed" in r["key"]), None),
        )
        return asdict(result)

    # -----------------------------------------------------
    # Replication metadata
    # -----------------------------------------------------
    def extract_replication_metadata(self) -> List[Dict[str, Any]]:
        ws = self.ws
        raw_sheets = self._find_raw_sheets()
        metadata: List[Dict[str, Any]] = []

        # Scan rows 39-41 for test identifiers
        for row_idx in range(39, 42):
            test_id = ws.cell(row=row_idx, column=2).value
            if test_id is None:
                continue

            test_start = self.excel_date_to_string(ws.cell(row=row_idx, column=3).value)
            test_end = self.excel_date_to_string(ws.cell(row=row_idx, column=4).value)

            # Match raw sheet if available
            raw_sheet_name = None
            for rs in raw_sheets:
                if str(test_id).strip().lower() in rs.lower():
                    raw_sheet_name = rs
                    break
            if raw_sheet_name is None and raw_sheets:
                raw_sheet_name = raw_sheets[0]

            metadata.append(asdict(ReplicationMetadata(
                test_identifier_number=str(test_id).strip(),
                test_start_date=test_start,
                test_end_date=test_end,
                replicate_label="DSC Thermogram",
                raw_sheet_name=raw_sheet_name,
                processed_sheet_name=None,
            )))

        # Fallback: if no metadata found but raw sheets exist
        if not metadata and raw_sheets:
            for rs in raw_sheets:
                metadata.append(asdict(ReplicationMetadata(
                    test_identifier_number=None,
                    test_start_date=None,
                    test_end_date=None,
                    replicate_label="DSC Thermogram",
                    raw_sheet_name=rs,
                    processed_sheet_name=None,
                )))

        return metadata

    # -----------------------------------------------------
    # Raw data
    # -----------------------------------------------------
    def extract_raw_data(self) -> List[Dict[str, Any]]:
        raw_sheets = self._find_raw_sheets()
        raw_blocks: List[Dict[str, Any]] = []

        for raw_sheet_name in raw_sheets:
            raw_blocks.append(self._extract_raw_block(raw_sheet_name))

        return raw_blocks

    def _extract_raw_block(self, raw_sheet_name: str) -> Dict[str, Any]:
        ws = self.wb[raw_sheet_name]

        # Detect column layout from header row
        headers: Dict[int, str] = {}
        for col_idx in range(1, ws.max_column + 1):
            v = ws.cell(row=1, column=col_idx).value
            if v is not None:
                headers[col_idx] = str(v).strip()

        time_col: Optional[int] = None
        temp_col: Optional[int] = None
        heat_flow_col: Optional[int] = None

        for col_idx, header in headers.items():
            h_lower = header.lower()
            if "time" in h_lower:
                time_col = col_idx
            elif "temp" in h_lower:
                temp_col = col_idx
            elif "dsc" in h_lower or "heat" in h_lower or "mw" in h_lower:
                heat_flow_col = col_idx

        # Fallback: assume col 1=time, 2=temp, 3=heat flow
        if time_col is None:
            time_col = 1
        if temp_col is None:
            temp_col = 2
        if heat_flow_col is None:
            heat_flow_col = 3

        # Detect units from header text
        time_unit = "min"
        temp_unit = "°C"
        heat_flow_unit = "mW/mg"

        for col_idx, header in headers.items():
            if col_idx == time_col and "[" in header:
                time_unit = header.split("[")[-1].rstrip("]").strip()
            elif col_idx == temp_col and "[" in header:
                temp_unit = header.split("[")[-1].rstrip("]").strip()
            elif col_idx == heat_flow_col:
                # Parse unit from header like "DSC/(mW/mg)"
                if "/" in header:
                    parts = header.split("/", 1)
                    if len(parts) > 1:
                        heat_flow_unit = parts[1].strip().strip("()")

        data_points: List[Dict[str, Any]] = []
        time_vals: List[float] = []
        temp_vals: List[float] = []
        hf_vals: List[float] = []

        for row_idx in range(2, ws.max_row + 1):
            t = self._safe_float(ws.cell(row=row_idx, column=time_col).value)
            if t is None:
                continue

            temp = self._safe_float(ws.cell(row=row_idx, column=temp_col).value)
            hf = self._safe_float(ws.cell(row=row_idx, column=heat_flow_col).value)

            data_points.append(asdict(DSCDataPoint(
                time_min=t,
                temperature_c=temp,
                heat_flow_mw_per_mg=hf,
            )))
            time_vals.append(t)
            if temp is not None:
                temp_vals.append(temp)
            if hf is not None:
                hf_vals.append(hf)

        result = DSCRawDataBlock(
            metric_name="DSC Thermogram (Temperature vs Heat Flow)",
            raw_sheet_name=raw_sheet_name,
            time_unit=time_unit,
            temperature_unit=temp_unit,
            heat_flow_unit=heat_flow_unit,
            point_count=len(data_points),
            min_time_min=min(time_vals) if time_vals else None,
            max_time_min=max(time_vals) if time_vals else None,
            min_temperature_c=min(temp_vals) if temp_vals else None,
            max_temperature_c=max(temp_vals) if temp_vals else None,
            min_heat_flow=min(hf_vals) if hf_vals else None,
            max_heat_flow=max(hf_vals) if hf_vals else None,
            data_points=data_points,
        )
        return asdict(result)

    # -----------------------------------------------------
    # Final results (thermal events)
    # -----------------------------------------------------
    def extract_final_results(self) -> List[Dict[str, Any]]:
        final_sheets = self._find_final_results_sheets()

        if not final_sheets:
            self.parser_warnings.append({
                "type": "missing_sheet",
                "sheet": "Final results",
                "note": "No Final results sheet found in this DSC workbook.",
            })
            return []

        events: List[Dict[str, Any]] = []

        for fs_name in final_sheets:
            ws = self.wb[fs_name]

            # Row 2 contains headers in groups of 4 columns per thermal event
            # Row 3+ contains data values
            # Detect event groups from header row
            header_row = 2
            event_groups: List[Dict[str, Any]] = []

            col = 1
            while col <= ws.max_column:
                header_val = ws.cell(row=header_row, column=col).value
                if header_val is None:
                    col += 1
                    continue

                header_str = str(header_val).strip()

                # Check if this looks like an enthalpy / event header
                if "h" in header_str.lower() and ("j/g" in header_str.lower() or "deg" in header_str.lower()):
                    # This is an event group starting column
                    event_name = self._extract_event_name(header_str)

                    event_groups.append({
                        "event_name": event_name,
                        "enthalpy_col": col,
                        "temperature_col": col + 1 if col + 1 <= ws.max_column else None,
                        "sd_col": col + 2 if col + 2 <= ws.max_column else None,
                        "character_col": col + 3 if col + 3 <= ws.max_column else None,
                    })
                    col += 4
                else:
                    col += 1

            # Extract values from data rows (row 3+)
            for data_row in range(3, ws.max_row + 1):
                row_has_data = False
                for eg in event_groups:
                    enthalpy = self._safe_float(ws.cell(row=data_row, column=eg["enthalpy_col"]).value)
                    if enthalpy is not None:
                        row_has_data = True

                if not row_has_data:
                    continue

                for eg in event_groups:
                    enthalpy = self._safe_float(ws.cell(row=data_row, column=eg["enthalpy_col"]).value)
                    temp_val = ws.cell(row=data_row, column=eg["temperature_col"]).value if eg["temperature_col"] else None
                    sd_val = ws.cell(row=data_row, column=eg["sd_col"]).value if eg["sd_col"] else None
                    char_val = ws.cell(row=data_row, column=eg["character_col"]).value if eg["character_col"] else None

                    events.append(asdict(DSCThermalEvent(
                        event_name=eg["event_name"],
                        enthalpy_j_per_g=enthalpy,
                        onset_temperature_c=self._safe_float(temp_val) if temp_val is not None else None,
                        standard_deviation_pct=self._safe_float(sd_val) if sd_val is not None else None,
                        character=str(char_val).strip() if char_val is not None else None,
                    )))

        return events

    def _extract_event_name(self, header: str) -> str:
        """Extract a readable event name from the enthalpy column header."""
        h = header.strip()
        # Remove the ΔH / enthalpy unit suffix
        for suffix in ["ΔH Deg. [J/g]", "ΔH [J/g]", "[J/g]", "ΔH Deg.", "ΔH"]:
            if suffix in h:
                h = h.replace(suffix, "").strip()
                break

        # Clean up trailing colons, punctuation
        h = h.strip(": ").strip()

        if not h:
            return "Thermal Event"

        return h

    # -----------------------------------------------------
    # Processed data (DSC typically has none)
    # -----------------------------------------------------
    def extract_processed_data(self) -> Dict[str, Any]:
        processed_sheets = [
            s for s in self.wb.sheetnames
            if s.lower().startswith("processed data") or s.lower().startswith("processed_data")
        ]

        if not processed_sheets:
            return {
                "available": False,
                "notes": "No dedicated processed data sheet found in this DSC workbook.",
            }

        return {
            "available": True,
            "sheets": processed_sheets,
            "notes": "Processed data sheets found but no specific parsing implemented.",
        }

    # -----------------------------------------------------
    # Statistical analysis
    # -----------------------------------------------------
    def extract_statistical_analysis(self) -> Dict[str, Any]:
        return {
            "available": False,
            "notes": "No dedicated statistical analysis section was found in this DSC workbook.",
        }

    # -----------------------------------------------------
    # Parse all
    # -----------------------------------------------------
    def parse_all_data(self) -> Dict[str, Union[Dict, List]]:
        try:
            work_package_data = self.extract_work_package_data()
            material_data = self.extract_material_data()
            dispersion_data = self.extract_dispersion_data()
            instrumentation_data = self.extract_instrumentation_data()

            replication_metadata = self.extract_replication_metadata()
            raw_data = self.extract_raw_data()
            processed_data = self.extract_processed_data()
            final_results = self.extract_final_results()
            statistical_analysis = self.extract_statistical_analysis()

            parsed_data = {
                "test_details": {
                    "work_package": work_package_data,
                    "material": material_data,
                    "cell_line": {},
                    "dispersion": dispersion_data,
                    "instrumentation": instrumentation_data,
                },
                "replication_metadata": replication_metadata,
                "replications": raw_data,
                "processed_data": processed_data,
                "final_results": final_results,
                "statistical_analysis": statistical_analysis,
            }

            if self.parser_warnings:
                parsed_data["parser_warnings"] = self.parser_warnings

            logger.info("FINAL DSC JSON:\n%s", json.dumps(parsed_data, indent=2, default=str))
            return parsed_data

        except Exception as e:
            logger.error("Error parsing DSC file: %s\n%s", e, traceback.format_exc())
            raise


def parse_excel_dsc(file_path: str, sheet_name: str = "Test Information") -> Dict[str, Union[Dict, List]]:
    try:
        parser = DSCParser(file_path, sheet_name)
        return parser.parse_all_data()
    except Exception as e:
        logger.error("Error in parse_excel_dsc: %s\n%s", e, traceback.format_exc())
        raise


if __name__ == "__main__":
    import sys

    file_path = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads/WP2_DSC_29aR1.xlsx"
    parsed_data = parse_excel_dsc(file_path)

    print("=" * 70)
    print("DSC PARSER OUTPUT SUMMARY")
    print("=" * 70)

    wp = parsed_data["test_details"]["work_package"]
    print(f"\nWP: {wp['wp_name']}, Partner: {wp['partner']}")
    print(f"Test: {wp['test_acronym']} - {wp['full_test_name']}")
    print(f"Lead Scientists: {[s['name'] for s in wp['lead_scientists']]}")

    mat = parsed_data["test_details"]["material"]
    print(f"\nMaterial: {mat['material_name']} ({mat['material_identifier']})")
    print(f"CAS: {mat['cas_no']}, Supplier: {mat['material_supplier']}")

    inst = parsed_data["test_details"]["instrumentation"]
    print(f"\nInstrument: {inst['instrument_model']}")
    print(f"Crucible: {inst['crucible_type']}")
    print(f"Temp Range: {inst['temperature_range']}, Heating: {inst['heating_speed']}")

    print(f"\nReplication Metadata: {len(parsed_data['replication_metadata'])}")
    for rm in parsed_data["replication_metadata"]:
        print(f"  {rm['test_identifier_number']}: {rm['test_start_date']} to {rm['test_end_date']}")

    print(f"\nRaw Data Blocks: {len(parsed_data['replications'])}")
    for block in parsed_data["replications"]:
        print(f"  {block['metric_name']}: {block['point_count']} points")
        print(f"    Time: {block['min_time_min']:.2f} - {block['max_time_min']:.2f} {block['time_unit']}")
        print(f"    Temp: {block['min_temperature_c']:.1f} - {block['max_temperature_c']:.1f} {block['temperature_unit']}")
        print(f"    Heat Flow: {block['min_heat_flow']:.4f} - {block['max_heat_flow']:.4f} {block['heat_flow_unit']}")

    print(f"\nFinal Results (Thermal Events): {len(parsed_data['final_results'])}")
    for ev in parsed_data["final_results"]:
        print(f"  {ev['event_name']}: ΔH={ev['enthalpy_j_per_g']} J/g, "
              f"Onset={ev['onset_temperature_c']}°C, "
              f"Character={ev['character']}")

    if "parser_warnings" in parsed_data:
        print(f"\nParser Warnings ({len(parsed_data['parser_warnings'])}):")
        for w in parsed_data["parser_warnings"]:
            print(f"  [{w['type']}] {w.get('note', '')}")

    print("\n--- JSON Preview ---")
    preview = json.loads(json.dumps(parsed_data, default=str))
    for block in preview.get("replications", []):
        block["data_points"] = f"[{len(block['data_points'])} points]"
    print(json.dumps(preview, indent=2, default=str)[:5000])