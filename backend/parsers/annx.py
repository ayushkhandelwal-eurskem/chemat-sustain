"""Annexin V/DAPI apoptosis workbook parser (ANNX / WP3_ANX identifiers)."""
import json

from parsers.cell_assay import CellAssayParser, normalize_key


class ANNXParser(CellAssayParser):
    test_type = "ANNX"

    def blocks(self, prefix):
        blocks = []
        for ws in self.wb:
            if not normalize_key(ws.title).startswith(prefix):
                continue
            records = self.flow_records(ws)
            measurements = []
            for record in records:
                gate = str(record.get("gate", ""))
                if gate.startswith("AnnV"):
                    measurements.append({"endpoint": gate, "gate": gate,
                        "treatment": record.get("sample"), "value": record.get("percent_gated"),
                        "unit": "% of gated population", "replication": self.replication_id(ws.title),
                        "source_cell": f"{ws.title}!row {record['source_row']}", "sd": None})
            blocks.append({"replication": self.replication_id(ws.title), "source": self.table(ws),
                           "records": records, "measurements": measurements})
        return blocks

    def raw_blocks(self):
        return self.blocks("output_data_")

    def processed_blocks(self):
        return self.blocks("processed_data_")

    def final_measurements(self, ws):
        measurements = []
        replication = None
        treatment_row = None
        for row in ws:
            r = row[0].row
            if str(ws.cell(r, 3).value or "").startswith("WP"):
                replication = ws.cell(r, 3).value
            if ws.cell(r, 5).value == "NC":
                treatment_row = r
            gate = str(ws.cell(r, 4).value or "")
            if gate.startswith("AnnV") and treatment_row:
                for col in range(5, 10):
                    measurements.append(self.measurement(ws, r, col, ws.cell(r, 3).value,
                        ws.cell(treatment_row, col).value, "% of cell population",
                        replication=replication, gate=gate))
            if str(ws.cell(r, 4).value or "").strip().lower() == "mean" and treatment_row:
                for col in range(5, 10):
                    measurements.append(self.measurement(ws, r, col, ws.cell(r, 2).value,
                        ws.cell(treatment_row, col).value, "% of cell population",
                        sd=self.value(ws.cell(r + 1, col).value), gate=str(ws.cell(r, 3).value)))
        if not measurements:
            self.warn("No Annexin V/DAPI final-result blocks recognized; inspect retained source table.")
        return measurements


def parse_excel_annx(file_path: str):
    return ANNXParser(file_path).parse_all_data()


if __name__ == "__main__":
    import sys
    print(json.dumps(parse_excel_annx(sys.argv[1]), ensure_ascii=False, indent=2, allow_nan=False))