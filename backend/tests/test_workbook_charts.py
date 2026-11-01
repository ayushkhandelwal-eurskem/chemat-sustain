from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.data_source import NumDataSource, NumRef
from openpyxl.chart.error_bar import ErrorBars

from utils.test_images import list_images
from utils.workbook_charts import extract_workbook_charts


def workbook_chart(root, external=False):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Final results"
    for row in [("Treatment", "Viable", "SD"), ("NC", 0, 1), ("PC", 12, 2)]:
        sheet.append(row)
    chart = BarChart()
    chart.title = "Population"
    chart.y_axis.scaling.min = 0
    chart.y_axis.scaling.max = 100
    chart.add_data(Reference(sheet, min_col=2, min_row=1, max_row=3), titles_from_data=True)
    chart.set_categories(Reference(sheet, min_col=1, min_row=2, max_row=3))
    chart.series[0].errBars = ErrorBars(errValType="cust", errBarType="plus", plus=NumDataSource(numRef=NumRef(f="'Final results'!$C$2:$C$3")))
    if external:
        chart.series[0].val.numRef.f = "'Raw data'!$B$2:$B$3"
    sheet.add_chart(chart, "E2")
    raw = workbook.create_sheet("Raw data")
    raw.add_chart(BarChart(), "E2")
    path = root / "charts.xlsx"
    workbook.save(path)
    workbook.close()
    return path


def test_native_chart_values_errors_cache_and_replacement(tmp_path, monkeypatch):
    monkeypatch.setenv("TENANT_DATA_ROOT", str(tmp_path))
    path = workbook_chart(tmp_path)
    extract_workbook_charts(7, str(path))
    manifest = list_images(7)
    assert len(manifest["charts"]) == 1
    chart = manifest["charts"][0]
    assert chart["categories"] == ["NC", "PC"]
    assert chart["series"] == [{"name": "Viable", "values": [0, 12], "errors": [[0, 1], [0, 2]]}]
    assert chart["y_min"] == 0 and chart["y_max"] == 100
    assert not manifest["chart_warnings"]
    extract_workbook_charts(7, str(path))
    assert list_images(7) == manifest
    workbook = Workbook(); workbook.save(path); workbook.close()
    extract_workbook_charts(7, str(path))
    assert list_images(7)["charts"] == []


def test_chart_rejects_unreleased_sheet_references(tmp_path, monkeypatch):
    monkeypatch.setenv("TENANT_DATA_ROOT", str(tmp_path))
    path = workbook_chart(tmp_path, external=True)
    extract_workbook_charts(7, str(path))
    assert list_images(7)["charts"] == []
    assert list_images(7)["chart_warnings"]


def test_chart_external_path_is_not_read(tmp_path, monkeypatch):
    monkeypatch.setenv("TENANT_DATA_ROOT", str(tmp_path))
    extract_workbook_charts(7, "/etc/passwd")
    assert "charts" not in list_images(7)