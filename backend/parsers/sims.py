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
logging.getLogger("multipart.multipart").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# Dataclasses tailored for SIMS
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
    cas: Optional[str] = None
    cas_for_core: Optional[str] = None
    supplier: Optional[str] = None
    material_state: Optional[str] = None
    batch: Optional[str] = None
    preparation_date: Optional[str] = None
    molar_concentration: Optional[str] = None
    particles_stock: Optional[str] = None

@dataclass
class ReplicationData:
    test_identifier_number: Optional[str] = None
    test_start_date: Optional[str] = None
    test_end_date: Optional[str] = None
    replication_count: Optional[int] = None

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
class SIMSInstrumentationData:
    instrument_specs: Optional[str] = None
    primary_ions: Optional[str] = None
    detector: Optional[str] = None
    measurement_technique: Optional[str] = None
    mass_resolution: Optional[str] = None
    mass_range: Optional[str] = None
    scan_area: Optional[str] = None

@dataclass
class SIMSRawIon:
    channel: Optional[int] = None
    mass: Optional[float] = None
    intensity: Optional[int] = None

@dataclass
class SIMSRawData:
    negative_ions: List[SIMSRawIon] = field(default_factory=list)
    positive_ions: List[SIMSRawIon] = field(default_factory=list)

@dataclass
class SIMSProcessedIon:
    mass: Optional[float] = None
    counts: Optional[int] = None

@dataclass
class SIMSProcessedData:
    negative_ions: List[SIMSProcessedIon] = field(default_factory=list)
    positive_ions: List[SIMSProcessedIon] = field(default_factory=list)
    total_negative_counts: Optional[int] = None
    total_positive_counts: Optional[int] = None

@dataclass
class SIMSFinalIon:
    mass: Optional[float] = None
    fragment: Optional[str] = None

@dataclass
class SIMSFinalResults:
    negative_ions: List[SIMSFinalIon] = field(default_factory=list)
    positive_ions: List[SIMSFinalIon] = field(default_factory=list)

class SIMSParser:
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
            normalized = str(key).strip().lower() if key is not None else ""
            normalized = re.sub(r'[^a-z0-9]', '_', normalized)
            normalized = re.sub(r'_+', '_', normalized).strip('_')
            return normalized
        return None

    def split_value_unit(self, value: Optional[str]) -> tuple[Optional[Union[str, float]], Optional[str]]:
        if isinstance(value, str) and " " in value:
            parts = value.split(" ", 1)
            try:
                numeric = float(parts[0]) if '.' in parts[0] else int(parts[0])
                return numeric, parts[1] if len(parts) > 1 else None
            except (ValueError, IndexError):
                return parts[0], parts[1] if len(parts) > 1 else None
        return value, None

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

        for row_idx, row in enumerate(self.ws.iter_rows(min_row=1, max_col=5), start=1):
            key_cell = row[0].value
            if not key_cell:
                continue
            raw_key = str(key_cell)
            key = self.normalize_key(raw_key)
            if not key:
                continue

            value_cell = None
            for col_idx in range(1, 5):
                if col_idx < len(row) and row[col_idx].value is not None:
                    value_cell = row[col_idx].value
                    break

            email_cell = row[3].value if len(row) > 3 else None

            entry = {"Key": key, "Value": value_cell}

            if email_cell and re.match(self.email_regex, str(email_cell)):
                entry["Email"] = email_cell

            data.append(entry)

            if "lead scientist" in raw_key.lower():
                lead_scientists.append(Scientist(name=value_cell, email=email_cell))
            if "assay/test work" in raw_key.lower():
                assay_scientists.append(Scientist(name=value_cell, email=email_cell))

        wp_data = WorkPackageData(
            wp_name=next((d["Value"] for d in data if d["Key"] == "project_work_package"), None),
            partner=next((d["Value"] for d in data if d["Key"] == "partner_conducting_test_assay"), None),
            laboratory_name=next((d["Value"] for d in data if d["Key"] == "test_facility_laboratory_name"), None),
            full_test_name=next((d["Value"] for d in data if d["Key"] == "full_name_of_test_assay_add_oecd_test_ref_id_if_app"), None),
            test_acronym=next((d["Value"] for d in data if d["Key"] == "short_name_or_acronym_for_test_assay"), None),
            test_type=next((d["Value"] for d in data if d["Key"] == "type_or_class_of_experimental_test_as_used_here"), None),
            endpoint=next((d["Value"] for d in data if d["Key"] == "end_point_being_investigated_assessed_by_the_test"), None),
            endpoint_outcome=next((d["Value"] for d in data if d["Key"] == "metric_s_used_to_assess_end_point_outcome_response"), None),
            sop=next((d["Value"] for d in data if d["Key"] == "sop_s_for_test_ref_project_or_other_doc_title_id"), None),
            path=next((d["Value"] for d in data if d["Key"] == "path_link_to_sop_protocol_on_proj_server_web_where_applic"), None),
            lead_scientists=lead_scientists,
            assay_scientists=assay_scientists
        )
        return asdict(wp_data)

    def extract_material_data(self):
        data = []
        expected_keys = [
            "sample_cms_internal_identifier",
            "erm_identifier_number",
            "material_name",
            "core_chemistry",
            "cas_no",
            "cas_for_core",
            "material_supplier",
            "material_state",
            "batch",
            "date_of_sample_preparation_for_tests",
            "molar_concentration",
            "number_of_particles_in_stock"
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
                    elif similarity > 0.5:
                        potential_matches.append(f"Potential match for '{expected_key}': '{raw_key}' similarity={similarity:.2f}")

        if unmatched_keys:
            logger.warning(f"Unmatched material data keys: {unmatched_keys}")

        material_data = MaterialData(
            material_identifier=next((d["Value"] for d in data if d["Key"] == "sample_cms_internal_identifier"), None),
            erm_id=next((d["Value"] for d in data if d["Key"] == "erm_identifier_number"), None),
            material_name=next((d["Value"] for d in data if d["Key"] == "material_name"), None),
            core_chemistry=next((d["Value"] for d in data if d["Key"] == "core_chemistry"), None),
            cas=next((d["Value"] for d in data if d["Key"] == "cas_no"), None),
            cas_for_core=next((d["Value"] for d in data if d["Key"] == "cas_for_core"), None),
            supplier=next((d["Value"] for d in data if d["Key"] == "material_supplier"), None),
            material_state=next((d["Value"] for d in data if d["Key"] == "material_state"), None),
            batch=next((d["Value"] for d in data if d["Key"] == "batch"), None),
            preparation_date=self.excel_date_to_string(next((d["Value"] for d in data if d["Key"] == "date_of_sample_preparation_for_tests"), None)),
            molar_concentration=next((d["Value"] for d in data if d["Key"] == "molar_concentration"), None),
            particles_stock=next((d["Value"] for d in data if d["Key"] == "number_of_particles_in_stock"), None)
        )
        return asdict(material_data)

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
                    elif similarity > 0.5:
                        potential_matches.append(f"Potential match for '{expected_key}': '{raw_key}' similarity={similarity:.2f}")

        if unmatched_keys:
            logger.warning(f"Unmatched sample preparation data keys: {unmatched_keys}")

        sample_preparation_data = SamplePreparationData(
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
        )
        return asdict(sample_preparation_data)

    def extract_instrumentation_data(self):
        data = []
        expected_keys = [
            "sims_instrumentation_model_and_company",
            "primary_ions",
            "detector",
            "measurement_technique",
            "mass_resolution",
            "mass_range",
            "scan_area"
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
                    elif similarity > 0.5:
                        potential_matches.append(f"Potential match for '{expected_key}': '{raw_key}' similarity={similarity:.2f}")

        if unmatched_keys:
            logger.warning(f"Unmatched instrumentation data keys: {unmatched_keys}")

        instrumentation_data = SIMSInstrumentationData(
            instrument_specs=next((d["Value"] for d in data if d["Key"] == "sims_instrumentation_model_and_company"), None),
            primary_ions=next((d["Value"] for d in data if d["Key"] == "primary_ions"), None),
            detector=next((d["Value"] for d in data if d["Key"] == "detector"), None),
            measurement_technique=next((d["Value"] for d in data if d["Key"] == "measurement_technique"), None),
            mass_resolution=next((d["Value"] for d in data if d["Key"] == "mass_resolution"), None),
            mass_range=next((d["Value"] for d in data if d["Key"] == "mass_range"), None),
            scan_area=next((d["Value"] for d in data if d["Key"] == "scan_area"), None)
        )
        return asdict(instrumentation_data)

    def extract_replication(self):
        start_date = None
        end_date = None
        test_identifier = None
        replication_count = None
        for row in self.ws.iter_rows():
            key_cell = row[0].value
            if key_cell and 'test identifier number' in str(key_cell).lower():
                test_identifier = row[1].value
                start_date = self.excel_date_to_string(row[2].value)
                end_date = self.excel_date_to_string(row[3].value)
            if key_cell and 'replication' in str(key_cell).lower():
                replication_count = int(row[1].value) if row[1].value is not None else None
        if test_identifier is None:
            logger.warning("Could not find test identifier number in Test Information sheet.")
        return ReplicationData(
            test_identifier_number=test_identifier,
            test_start_date=start_date,
            test_end_date=end_date,
            replication_count=replication_count
        )

    def extract_raw_data(self, raw_sheet_name: str):
        match = re.search(r'R(\d+)', raw_sheet_name)
        run_number = int(match.group(1)) if match else 0

        if raw_sheet_name not in self.wb.sheetnames:
            logger.error(f"Raw data sheet {raw_sheet_name} not found")

        raw_ws = self.wb[raw_sheet_name]
        negative_ions = []
        positive_ions = []

        # Extract negative ions from rows 3 to 35796, columns A (1), B (2), C (3)
        for row_idx in range(3, 35797):
            neg_channel = raw_ws.cell(row=row_idx, column=1).value
            if neg_channel is None:
                break
            try:
                negative_ions.append(SIMSRawIon(
                    channel=int(neg_channel),
                    mass=round(float(raw_ws.cell(row=row_idx, column=2).value), 6) if raw_ws.cell(row=row_idx, column=2).value else None,
                    intensity=int(raw_ws.cell(row=row_idx, column=3).value) if raw_ws.cell(row=row_idx, column=3).value else None
                ))
            except (ValueError, TypeError):
                pass

        # Extract positive ions from rows 3 to 16036, columns Q (17), R (18), S (19)
        for row_idx in range(3, 16037):
            pos_channel = raw_ws.cell(row=row_idx, column=17).value
            if pos_channel is None:
                break
            try:
                positive_ions.append(SIMSRawIon(
                    channel=int(pos_channel),
                    mass=round(float(raw_ws.cell(row=row_idx, column=18).value), 6) if raw_ws.cell(row=row_idx, column=18).value else None,
                    intensity=int(raw_ws.cell(row=row_idx, column=19).value) if raw_ws.cell(row=row_idx, column=19).value else None
                ))
            except (ValueError, TypeError):
                pass

        return SIMSRawData(
            negative_ions=negative_ions,
            positive_ions=positive_ions
        )

    def extract_processed_data(self, processed_sheet_name: str):
        match = re.search(r'R(\d+)', processed_sheet_name)
        run_number = int(match.group(1)) if match else 0

        if processed_sheet_name not in self.wb.sheetnames:
            logger.error(f"Processed data sheet {processed_sheet_name} not found")

        proc_ws = self.wb[processed_sheet_name]
        negative_ions = []
        positive_ions = []
        total_negative_counts = None
        total_positive_counts = None

        # Extract negative ions from rows 2 to 11, columns B (2) mass, C (3) counts
        for row_idx in range(2, 12):
            neg_mass = proc_ws.cell(row=row_idx, column=2).value
            neg_counts = proc_ws.cell(row=row_idx, column=3).value
            if neg_mass is not None and neg_mass != '':
                try:
                    negative_ions.append(SIMSProcessedIon(
                        mass=round(float(neg_mass), 2),
                        counts=int(neg_counts) if neg_counts else None
                    ))
                except (ValueError, TypeError):
                    pass

        # Total negative counts at row 13, column C (3)
        total_negative_counts = int(proc_ws.cell(row=13, column=3).value) if proc_ws.cell(row=13, column=3).value else None

        # Extract positive ions from rows 17 to 24, columns B (2) mass, C (3) counts
        for row_idx in range(17, 25):
            pos_mass = proc_ws.cell(row=row_idx, column=2).value
            pos_counts = proc_ws.cell(row=row_idx, column=3).value
            if pos_mass is not None and pos_mass != '':
                try:
                    positive_ions.append(SIMSProcessedIon(
                        mass=round(float(pos_mass), 2),
                        counts=int(pos_counts) if pos_counts else None
                    ))
                except (ValueError, TypeError):
                    pass

        # Total positive counts at row 26, column C (3)
        total_positive_counts = int(proc_ws.cell(row=26, column=3).value) if proc_ws.cell(row=26, column=3).value else None

        return SIMSProcessedData(
            negative_ions=negative_ions,
            positive_ions=positive_ions,
            total_negative_counts=total_negative_counts,
            total_positive_counts=total_positive_counts
        )

    def extract_final_results(self):
        final_sheet_name = [name for name in self.wb.sheetnames if "Final results" in name][0] if any("Final results" in name for name in self.wb.sheetnames) else None
        if not final_sheet_name:
            logger.error("Final Results sheet not found")
            return SIMSFinalResults()

        final_ws = self.wb[final_sheet_name]
        negative_ions = []
        positive_ions = []

        neg_masses = final_ws['B4:J4'][0] if final_ws['B4:J4'] else []
        neg_fragments = final_ws['B5:J5'][0] if final_ws['B5:J5'] else []
        pos_masses = final_ws['B7:J7'][0] if final_ws['B7:J7'] else []
        pos_fragments = final_ws['B8:J8'][0] if final_ws['B8:J8'] else []

        for mass, fragment in zip(neg_masses, neg_fragments):
            if mass.value is not None and fragment.value is not None:
                try:
                    negative_ions.append(SIMSFinalIon(
                        mass=round(float(mass.value), 2),
                        fragment=str(fragment.value)
                    ))
                except (ValueError, TypeError):
                    pass

        for mass, fragment in zip(pos_masses, pos_fragments):
            if mass.value is not None and fragment.value is not None:
                try:
                    positive_ions.append(SIMSFinalIon(
                        mass=round(float(mass.value), 2),
                        fragment=str(fragment.value)
                    ))
                except (ValueError, TypeError):
                    pass

        return SIMSFinalResults(
            negative_ions=negative_ions,
            positive_ions=positive_ions
        )

    def parse_all_data(self) -> Dict[str, Union[Dict, List]]:
        try:
            work_package_data = self.extract_work_package_data()
            material_data = self.extract_material_data()
            sample_preparation_data = self.extract_sample_preparation_data()
            instrumentation_data = self.extract_instrumentation_data()
            replication = self.extract_replication()

            parsed_data = {
                'test_details': {
                    'work_package': work_package_data,
                    'material': material_data,
                    'sample_preparation': sample_preparation_data,
                    'instrumentation': instrumentation_data
                },
                'replication': asdict(replication),
                'replications': [],
                'processed_data': [],
                'final_results': asdict(self.extract_final_results())
            }

            raw_sheets = [name for name in self.wb.sheetnames if name.startswith("Raw data_WP2_SIMS_")]
            processed_sheets = [name for name in self.wb.sheetnames if name.startswith("Processed data_WP2_SIMS_")]

            for raw_name in raw_sheets:
                parsed_data['replications'].append(asdict(self.extract_raw_data(raw_name)))

            for proc_name in processed_sheets:
                parsed_data['processed_data'].append(asdict(self.extract_processed_data(proc_name)))

            return parsed_data
        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}\n{traceback.format_exc()}")
            raise

def parse_excel_sims(file_path: str, sheet_name: str = "Test Information") -> Dict[str, Union[Dict, List]]:
    try:
        parser = SIMSParser(file_path, sheet_name)
        return parser.parse_all_data()
    except Exception as e:
        logger.error(f"Error in parse_excel_sims: {e}\n{traceback.format_exc()}")
        raise

if __name__ == "__main__":
    file_path = "backend/data/WP2_SIMS_2aR1.xlsx"
    try:
        parsed_data = parse_excel_sims(file_path)
        print(parsed_data['test_details'])
        #print(parsed_data['replications'])
        #print(parsed_data['processed_data'])
    except Exception as e:
        print(f"Error: {e}")