"""Embedded drawings are identified, not assigned invented biological labels."""
import hashlib
import json
from io import BytesIO

from openpyxl import Workbook
from openpyxl.drawing.image import Image
from PIL import Image as PILImage

from parsers.cell_assay import CellAssayParser


def test_source_images_retain_identity_anchor_and_repeatable_hash(tmp_path):
    stream = BytesIO()
    PILImage.new("RGB", (2, 2), "white").save(stream, format="PNG")
    expected = hashlib.sha256(stream.getvalue()).hexdigest()
    stream.seek(0)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Test_conditions"
    sheet.append(["Short name or acronym", "PCR"])
    sheet.add_image(Image(stream), "D5")
    path = tmp_path / "images.xlsx"
    workbook.save(path)
    workbook.close()

    class Parser(CellAssayParser):
        test_type = "PCR"

    parser = Parser(str(path))
    try:
        first = parser.table(parser.ws)
        assert first == parser.table(parser.ws)
        assert first["embedded_images"] == [{"sha256": expected, "anchor_row": 5,
                                               "anchor_column": 4, "sheet_name": "Test_conditions"}]
        json.dumps(first, allow_nan=False)
    finally:
        parser.close()