import json

import openpyxl
import pytest

from parsers.pcr import parse_excel_pcr
from parsers.pcr_microfludic import parse_excel_pcr_microfludic
from test_cell_assay_parsers import make_workbook


def test_microfludic_preserves_pcr_science_and_source_identity(tmp_path):
    path = str(make_workbook(tmp_path / "pcr.xlsx"))
    standard = parse_excel_pcr(path)
    variant = parse_excel_pcr_microfludic(path)
    assert variant["test_details"].pop("platform_test_type") == "PCR-Microfludic"
    assert variant == standard
    assert variant["test_details"]["work_package"]["test_acronym"] == "PCR"
    json.dumps(variant, allow_nan=False)


@pytest.mark.parametrize("acronym", ["PCR-Microfludic", "PCR-Microfluidic"])
def test_microfludic_accepts_explicit_variant_acronyms(tmp_path, acronym):
    path = make_workbook(tmp_path / "variant.xlsx")
    wb = openpyxl.load_workbook(path)
    wb["Test_conditions"]["B18"] = acronym
    wb.save(path)
    wb.close()
    data = parse_excel_pcr_microfludic(str(path))
    assert data["test_details"]["work_package"]["test_acronym"] == acronym
    assert len(data["replications"][0]["measurements"]) == 8


def test_microfludic_rejects_non_pcr_workbook(tmp_path):
    path = make_workbook(tmp_path / "annx.xlsx", "ANNX")
    with pytest.raises(ValueError, match="Expected PCR-Microfludic workbook"):
        parse_excel_pcr_microfludic(str(path))