import openpyxl
import re
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Union
import logging
import traceback
from datetime import datetime, timedelta
from difflib import SequenceMatcher

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@dataclass
class Scientist:
    name: Optional[str] = None
    email: Optional[str] = None

@dataclass
class WorkPackageData:
    wp_name: Optional[str] = None
    partner: Optional[str] = None
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
    core_chemistry: Optional[str] = None
    material_name: Optional[str] = None
    material_state: Optional[str] = None
    cas: Optional[str] = None
    casforcore: Optional[str] = None
    batch: Optional[str] = None
    preparation_date: Optional[str] = None
    particles_stock: Optional[str] = None
    molar_concentration: Optional[str] = None

@dataclass
class SamplePreparationData:
    dispersion_protocol: Optional[str] = None
    dispersion_technique: Optional[str] = None
    dispersion_medium: Optional[str] = None
    sonicator_type: Optional[str] = None
    power: Optional[str] = None
    sonication_time: Optional[str] = None
    tip_thickness: Optional[str] = None
    tip_composition: Optional[str] = None
    ultrasonic_bath_size: Optional[str] = None
    sample_volume: Optional[str] = None
    final_concentration: Optional[str] = None
    additional_info: Optional[str] = None

@dataclass
class InstrumentationData:
    instrument_specifications: Optional[str] = None
    software: Optional[str] = None
    display_model: Optional[str] = None
    cell_model: Optional[str] = None
    optical_path_length: Optional[str] = None
    start_wavelength: Optional[str] = None
    end_wavelength: Optional[str] = None
    wavelength_interval: Optional[str] = None
    background: Optional[str] = None

@dataclass
class SpectrumPoint:
    wavelength: float
    absorbance: float

@dataclass
class Peak:
    absorbance: Optional[float] = None
    wavelength: Optional[float] = None
    compound: Optional[str] = None

@dataclass
class RawData:
    spectrum: List[SpectrumPoint] = field(default_factory=list)

@dataclass
class FinalResults:
    peaks: List[Peak] = field(default_factory=list)

class UVVisParser:
    def __init__(self, file_path: str, sheet_name: str = "Test Information"):
        self.file_path = file_path
        self.sheet_name = sheet_name
        try:
            self.wb = openpyxl.load_workbook(file_path, data_only=True)
            self.ws = self.wb[sheet_name]
            logger.info(f"Successfully loaded Excel file: {file_path}")
        except Exception as e:
            logger.error(f"Failed to load workbook or sheet {sheet_name}: {e}")
            raise
        self.email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'

    def normalize_key(self, key: Optional[str]) -> Optional[str]:
        if key:
            normalized = key.strip().lower()
            normalized = re.sub(r'[^a-z0-9]', '_', normalized)
            normalized = re.sub(r'_+', '_', normalized).strip('_')
            return normalized
        return None

    def excel_date_to_string(self, value: Optional[Union[float, str]]) -> Optional[str]:
        try:
            if isinstance(value, (int, float)):
                base_date = datetime(1899, 12, 30)
                delta = timedelta(days=float(value))
                return (base_date + delta).strftime("%Y-%m-%d")
            elif isinstance(value, str):
                for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"]:
                    try:
                        return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
                    except ValueError:
                        pass
            return str(value) if value else None
        except Exception as e:
            logger.warning(f"Failed to convert date {value}: {e}")
            return None

    def extract_work_package_data(self):
        data = []
        lead_scientists = []
        assay_scientists = []

        for row in self.ws.iter_rows():
            key_cell = row[0].value
            value_cell = row[1].value if len(row) > 1 else None
            email_cell = row[3].value if len(row) > 3 else None
            comment = row[0].comment

            if comment:
                key = self.normalize_key(key_cell)
                if not key:
                    continue
                entry = {"Key": key, "Value": value_cell}

                if email_cell and re.match(self.email_regex, str(email_cell)):
                    entry["Email"] = email_cell

                if "lead_scientist_contact_for_test" in key:
                    lead_scientists.append(asdict(Scientist(name=value_cell, email=email_cell)))
                if "assay_test_work_conducted_by" in key:
                    assay_scientists.append(asdict(Scientist(name=value_cell, email=email_cell)))

                data.append(entry)

        wp_data = asdict(WorkPackageData(
            wp_name=next((d["Value"] for d in data if d["Key"] == "project_work_package"), None),
            partner=next((d["Value"] for d in data if d["Key"] == "partner_conducting_test_assay"), None),
            full_test_name=next((d["Value"] for d in data if d["Key"] == "full_name_of_test_assay_add_oecd_test_ref_id_if_app"), None),
            test_acronym=next((d["Value"] for d in data if d["Key"] == "short_name_or_acronym_for_test_assay"), None),
            test_type=next((d["Value"] for d in data if d["Key"] == "type_or_class_of_experimental_test_as_used_here"), None),
            endpoint=next((d["Value"] for d in data if d["Key"] == "end_point_being_investigated_assessed_by_the_test"), None),
            endpoint_outcome=next((d["Value"] for d in data if d["Key"] == "metric_s_used_to_assess_end_point_outcome_response"), None),
            sop=next((d["Value"] for d in data if d["Key"] == "sop_s_for_test_ref_project_or_other_doc_title_id"), None),
            path=next((d["Value"] for d in data if d["Key"] == "path_link_to_sop_protocol_on_proj_server_web_where_applic"), None),
            lead_scientists=lead_scientists,
            assay_scientists=assay_scientists
        ))
        return wp_data

    def extract_material_data(self):
        data = []
        expected_keys = [
            "sample_cms_internal_identifier",
            "erm_identifier_number",
            "core_chemistry",
            "material_name",
            "material_state",
            "cas_no",
            "cas_for_core",
            "batch",
            "date_of_preparation",
            "no_of_particles_in_stock",
            "molar_concentration"
        ]
        unmatched_keys = set(expected_keys)
        potential_matches = []

        for row_idx, row in enumerate(self.ws.iter_rows(min_row=1, max_col=5), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue
            raw_key = str(key_cell)
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value = None
            for col_idx in range(1, 5):
                if col_idx < len(row) and row[col_idx].value is not None:
                    value = row[col_idx].value
                    break

            if key in expected_keys:
                unmatched_keys.discard(key)
                data.append({"Key": key, "Value": value})
            else:
                for expected_key in expected_keys:
                    similarity = SequenceMatcher(None, key, expected_key).ratio()
                    if similarity > 0.85:
                        unmatched_keys.discard(expected_key)
                        data.append({"Key": expected_key, "Value": value})

        material_data = asdict(MaterialData(
            material_identifier=next((d["Value"] for d in data if d["Key"] == "sample_cms_internal_identifier"), None),
            erm_id=next((d["Value"] for d in data if d["Key"] == "erm_identifier_number"), None),
            core_chemistry=next((d["Value"] for d in data if d["Key"] == "core_chemistry"), None),
            material_name=next((d["Value"] for d in data if d["Key"] == "material_name"), None),
            material_state=next((d["Value"] for d in data if d["Key"] == "material_state"), None),
            cas=next((d["Value"] for d in data if d["Key"] == "cas_no"), None),
            casforcore=next((d["Value"] for d in data if d["Key"] == "cas_for_core"), None),
            batch=next((d["Value"] for d in data if d["Key"] == "batch"), None),
            preparation_date=self.excel_date_to_string(next((d["Value"] for d in data if d["Key"] == "date_of_preparation"), None)),
            particles_stock=next((d["Value"] for d in data if d["Key"] == "no_of_particles_in_stock"), None),
            molar_concentration=next((d["Value"] for d in data if d["Key"] == "molar_concentration"), None)
        ))
        return material_data

    def extract_sample_preparation_data(self):
        data = []
        expected_keys = [
            "specify_standard_dispersion_protocol_used",
            "or_otherwise_specify_dispersion_technique_used",
            "dispersion_dilution_medium",
            "sonicator_type",
            "power_w",
            "sonication_time_secs",
            "tip_thickness_mm",
            "tip_composition",
            "size_of_ultrasonic_bath_water_volume_dm3",
            "sample_volume",
            "final_sample_concentration_mg_l_or_ppm",
            "additional_information"
        ]
        unmatched_keys = set(expected_keys)
        potential_matches = []

        for row_idx, row in enumerate(self.ws.iter_rows(min_row=1, max_col=5), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue
            raw_key = str(key_cell)
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value = None
            for col_idx in range(1, 5):
                if col_idx < len(row) and row[col_idx].value is not None:
                    value = row[col_idx].value
                    break

            if key in expected_keys:
                unmatched_keys.discard(key)
                data.append({"Key": key, "Value": value})
            else:
                for expected_key in expected_keys:
                    similarity = SequenceMatcher(None, key, expected_key).ratio()
                    if similarity > 0.85:
                        unmatched_keys.discard(expected_key)
                        data.append({"Key": expected_key, "Value": value})

        sample_preparation_data = asdict(SamplePreparationData(
            dispersion_protocol=next((d["Value"] for d in data if d["Key"] == "specify_standard_dispersion_protocol_used"), None),
            dispersion_technique=next((d["Value"] for d in data if d["Key"] == "or_otherwise_specify_dispersion_technique_used"), None),
            dispersion_medium=next((d["Value"] for d in data if d["Key"] == "dispersion_dilution_medium"), None),
            sonicator_type=next((d["Value"] for d in data if d["Key"] == "sonicator_type"), None),
            power=next((d["Value"] for d in data if d["Key"] == "power_w"), None),
            sonication_time=next((d["Value"] for d in data if d["Key"] == "sonication_time_secs"), None),
            tip_thickness=next((d["Value"] for d in data if d["Key"] == "tip_thickness_mm"), None),
            tip_composition=next((d["Value"] for d in data if d["Key"] == "tip_composition"), None),
            ultrasonic_bath_size=next((d["Value"] for d in data if d["Key"] == "size_of_ultrasonic_bath_water_volume_dm3"), None),
            sample_volume=next((d["Value"] for d in data if d["Key"] == "sample_volume"), None),
            final_concentration=next((d["Value"] for d in data if d["Key"] == "final_sample_concentration_mg_l_or_ppm"), None),
            additional_info=next((d["Value"] for d in data if d["Key"] == "additional_information"), None)
        ))
        return sample_preparation_data

    def extract_instrumentation_data(self):
        data = []
        expected_keys = [
            "uv_vis_instrument_specifications",
            "software",
            "display_model",
            "cell_model",
            "optical_path_length",
            "start_wavelength",
            "end_wavelength",
            "wavelength_interval_nm",
            "background"
        ]
        unmatched_keys = set(expected_keys)
        potential_matches = []

        for row_idx, row in enumerate(self.ws.iter_rows(min_row=1, max_col=5), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue
            raw_key = str(key_cell)
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value = None
            for col_idx in range(1, 5):
                if col_idx < len(row) and row[col_idx].value is not None:
                    value = row[col_idx].value
                    break

            if key in expected_keys:
                unmatched_keys.discard(key)
                data.append({"Key": key, "Value": value})
            else:
                for expected_key in expected_keys:
                    similarity = SequenceMatcher(None, key, expected_key).ratio()
                    if similarity > 0.85:
                        unmatched_keys.discard(expected_key)
                        data.append({"Key": expected_key, "Value": value})

        instrumentation_data = asdict(InstrumentationData(
            instrument_specifications=next((d["Value"] for d in data if d["Key"] == "uv_vis_instrument_specifications"), None),
            software=next((d["Value"] for d in data if d["Key"] == "software"), None),
            display_model=next((d["Value"] for d in data if d["Key"] == "display_model"), None),
            cell_model=next((d["Value"] for d in data if d["Key"] == "cell_model"), None),
            optical_path_length=next((d["Value"] for d in data if d["Key"] == "optical_path_length"), None),
            start_wavelength=next((d["Value"] for d in data if d["Key"] == "start_wavelength"), None),
            end_wavelength=next((d["Value"] for d in data if d["Key"] == "end_wavelength"), None),
            wavelength_interval=next((d["Value"] for d in data if d["Key"] == "wavelength_interval_nm"), None),
            background=next((d["Value"] for d in data if d["Key"] == "background"), None)
        ))
        return instrumentation_data

    def extract_raw_data(self):
        raw_sheet_name = [name for name in self.wb.sheetnames if "Raw data" in name][0] if any("Raw data" in name for name in self.wb.sheetnames) else None
        if not raw_sheet_name:
            logger.error("Raw data sheet not found")
            return asdict(RawData())

        ws = self.wb[raw_sheet_name]
        spectrum = []

        # Log first 5 rows for debugging
        logger.debug(f"Raw data first 5 rows:")
        for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=5, max_col=3), start=1):
            values = [str(cell.value)[:30] if cell.value else "None" for cell in row]
            logger.debug(f"Row {row_idx}: {values}")

        # Find header
        header_row = None
        for row_idx in range(1, ws.max_row + 1):
            if ws.cell(row_idx, 2).value == "Wavelength [nm]" and ws.cell(row_idx, 3).value == "Absorbance":
                header_row = row_idx
                wavelength_col = 2
                absorbance_col = 3
                logger.debug(f"Found header at row {row_idx}")
                break

        if header_row:
            for row_idx in range(header_row + 1, ws.max_row + 1):
                wavelength = ws.cell(row=row_idx, column=wavelength_col).value
                absorbance = ws.cell(row=row_idx, column=absorbance_col).value
                if wavelength is None:
                    break
                try:
                    spectrum.append(SpectrumPoint(
                        wavelength=float(wavelength),
                        absorbance=float(absorbance)
                    ))
                except (ValueError, TypeError):
                    continue
            logger.debug(f"Extracted {len(spectrum)} spectrum points")

        return asdict(RawData(spectrum=spectrum))

    def extract_final_results(self):
        final_sheet_name = [name for name in self.wb.sheetnames if "Final results" in name][0] if any("Final results" in name for name in self.wb.sheetnames) else None
        if not final_sheet_name:
            logger.error("Final results sheet not found")
            return asdict(FinalResults())

        ws = self.wb[final_sheet_name]
        peaks = []

        # Log first 5 rows
        logger.debug(f"Final results first 5 rows:")
        for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=5, max_col=12), start=1):
            values = [str(cell.value)[:30] if cell.value else "None" for cell in row]
            logger.debug(f"Row {row_idx}: {values}")

        # Extract peaks from row 4
        data_row = 4
        for i in range(1, 13, 3):  # Columns B-D, E-G, H-J, K-M (1-based: 2-4,5-7,8-10,11-13)
            absorbance = ws.cell(row=data_row, column=i).value
            wavelength = ws.cell(row=data_row, column=i+1).value
            compound = ws.cell(row=data_row, column=i+2).value
            if absorbance is None:
                break
            try:
                peaks.append(Peak(
                    absorbance=float(absorbance) if absorbance else None,
                    wavelength=float(wavelength) if wavelength else None,
                    compound=str(compound) if compound else None
                ))
            except ValueError:
                continue

        logger.debug(f"Extracted {len(peaks)} peaks")
        return asdict(FinalResults(peaks=peaks))

    def parse_all_data(self) -> Dict[str, Union[Dict, List]]:
        try:
            work_package_data = self.extract_work_package_data()
            material_data = self.extract_material_data()
            sample_preparation_data = self.extract_sample_preparation_data()
            instrumentation_data = self.extract_instrumentation_data()

            parsed_data = {
                'test_details': {
                    'work_package': work_package_data,
                    'material': material_data,
                    'sample_preparation': sample_preparation_data,
                    'instrumentation': instrumentation_data
                },
                'raw_data': self.extract_raw_data(),
                'final_results': self.extract_final_results()
            }

            return parsed_data
        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}\n{traceback.format_exc()}")
            raise

def parse_excel_uv_vis(file_path: str, sheet_name: str = "Test Information") -> Dict[str, Union[Dict, List]]:
    try:
        parser = UVVisParser(file_path, sheet_name)
        return parser.parse_all_data()
    except Exception as e:
        logger.error(f"Error in parse_excel_uv_vis: {e}\n{traceback.format_exc()}")
        raise

if __name__ == "__main__":
    file_path = "/Users/ayushkhandelwal/Documents/chemat-sustain/backend/data/WP2_UV-Vis_1aR1.xlsx"
    try:
        parsed_data = parse_excel_uv_vis(file_path)
        print("Parsed Data:")
        print("Test Details:", parsed_data['test_details'])
        print("Raw Data Spectrum Length:", parsed_data['raw_data'])
        print("Final Results Peaks:", parsed_data['final_results']['peaks'])
    except Exception as e:
        print(f"Error: {e}")