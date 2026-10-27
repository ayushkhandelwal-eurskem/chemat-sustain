"""Real-time PCR: cached mean Ct and 2^-delta-delta-Ct fold changes."""
import json
import math

from parsers.cell_assay import CellAssayParser, normalize_key


class PCRParser(CellAssayParser):
    test_type = "PCR"

    def blocks(self, prefix, raw=False, include_source=True):
        blocks = []
        for ws in self.wb:
            if not normalize_key(ws.title).startswith(prefix):
                continue
            measurements = []
            label_col = 3 if raw else 1
            header_row = next((r for r in range(1, ws.max_row + 1)
                               if str(ws.cell(r, label_col).value or "").strip() == ("Mean Ct" if raw else "Fold change vs CTRL")), None)
            if header_row:
                for r in range(header_row + 1, ws.max_row + 1):
                    endpoint = ws.cell(r, label_col).value
                    if not endpoint or not any(isinstance(ws.cell(r, c).value, (int, float)) for c in range(label_col + 1, label_col + 5)):
                        continue
                    for c in range(label_col + 1, label_col + 5):
                        measurements.append(self.measurement(ws, r, c, endpoint, ws.cell(header_row, c).value,
                            "Ct" if raw else "Fold change vs CTRL", replication=self.replication_id(ws.title)))
            else:
                self.warn(f"Missing {'Mean Ct' if raw else 'Fold change vs CTRL'} header in {ws.title}.")
            block = {"replication": self.replication_id(ws.title), "measurements": measurements}
            if include_source:
                block["source"] = self.table(ws)
            blocks.append(block)
        return blocks

    def raw_blocks(self):
        return self.blocks("raw_data_", raw=True)

    def processed_blocks(self):
        return self.blocks("processed_data_")

    def final_measurements(self, ws):
        measurements = []
        # Side-by-side endpoint blocks, discovered by the scientific unit header.
        for row in ws:
            for cell in row:
                if not isinstance(cell.value, str) or "(Fold change vs CTRL)" not in cell.value:
                    continue
                endpoint = cell.value.split(" (", 1)[0].strip()
                for r in range(cell.row + 1, cell.row + 6):
                    label = str(ws.cell(r, cell.column).value or "").strip()
                    if not (label.startswith("WP") or label.upper() == "MEAN"):
                        continue
                    for c in range(cell.column + 1, cell.column + 5):
                        measurements.append(self.measurement(ws, r, c, endpoint, ws.cell(cell.row, c).value,
                            "Fold change vs CTRL", replication=label if label.startswith("WP") else None,
                            sd=self.value(ws.cell(r + 1, c).value) if label.upper() == "MEAN" else None))
        # Detect accidental cross-run copying in future workbook uploads.
        # Preserve both sets and flag disagreements rather than choosing one.
        for block in self.blocks("processed_data_", include_source=False):
            for value in block["measurements"]:
                match = next((m for m in measurements if all(m[k] == value[k] for k in ("replication", "endpoint", "treatment"))), None)
                if match and isinstance(match["value"], (int, float)) and isinstance(value["value"], (int, float)):
                    if not math.isclose(match["value"], value["value"], rel_tol=0.001, abs_tol=0.001):
                        self.warn(f"Processed/final disagreement: {value['replication']} {value['endpoint']} {value['treatment']}; values retained separately.")
        if not measurements:
            self.warn("No PCR final-result blocks recognized; inspect retained source table.")
        for row in ws:
            if any(str(c.value or "").strip() == "IRAK1 miR-146a" for c in row):
                self.warn("Ambiguous final-results post-hoc header 'IRAK1 miR-146a'; original header retained.")
        return measurements


def parse_excel_pcr(file_path: str):
    return PCRParser(file_path).parse_all_data()


if __name__ == "__main__":
    import sys
    print(json.dumps(parse_excel_pcr(sys.argv[1]), ensure_ascii=False, indent=2, allow_nan=False))