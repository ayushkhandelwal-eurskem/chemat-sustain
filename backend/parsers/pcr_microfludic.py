"""PCR-Microfludic platform variant using the supplied PCR workbook template.

The workbook calls the assay PCR. Preserve that source identity and measurements
while recording the user-selected platform variant separately; never infer
microfluidic experimental parameters that the workbook does not supply.
"""
import json

from parsers.pcr import PCRParser


class PCRMicrofludicParser(PCRParser):
    test_type = "PCR-Microfludic"
    workbook_acronyms = ("PCR", "PCR-Microfludic", "PCR-Microfluidic")

    def extract_details(self):
        details = super().extract_details()
        details["platform_test_type"] = self.test_type
        return details


def parse_excel_pcr_microfludic(file_path: str):
    return PCRMicrofludicParser(file_path).parse_all_data()


if __name__ == "__main__":
    import sys
    print(json.dumps(parse_excel_pcr_microfludic(sys.argv[1]), ensure_ascii=False, indent=2, allow_nan=False))