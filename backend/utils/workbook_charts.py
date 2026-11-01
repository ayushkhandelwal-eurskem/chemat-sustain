"""Read native final-result Excel charts without evaluating workbook formulas."""
import math
import os
import re
from pathlib import Path

import openpyxl
from openpyxl.chart import BarChart, LineChart
from openpyxl.utils.cell import range_to_tuple

from utils.test_images import locked_manifest, sheet_category

MAX_POINTS = 2000


def chart_text(title):
    rich = getattr(getattr(title, "tx", None), "rich", None)
    return " ".join("".join(run.t for run in paragraph.r) for paragraph in rich.p).strip() if rich else ""


def numbers(values):
    return [float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None for v in values]


def source_values(source, workbook, sheet_name):
    if source is None:
        return []
    for kind in ("numRef", "strRef"):
        reference = getattr(source, kind, None)
        if reference is not None:
            formula = reference.f
            if not isinstance(formula, str):
                raise ValueError("Missing chart reference")
            # Excel writes sparse series as parenthesized unions. Split only
            # outside quoted sheet names (which may themselves contain commas).
            if formula.startswith("(") and formula.endswith(")"):
                formula = formula[1:-1]
            parts = re.split(r",(?=(?:[^']*'[^']*')*[^']*$)", formula)
            values = []
            for part in parts:
                values.extend(reference_values(part.strip(), workbook, sheet_name))
                if len(values) > MAX_POINTS:
                    raise ValueError("Too many chart points")
            return values
    for kind in ("numLit", "strLit"):
        literal = getattr(source, kind, None)
        if literal is not None:
            count = literal.ptCount or len(literal.pt)
            if count > MAX_POINTS:
                raise ValueError("Too many chart points")
            values = [None] * count
            for point in literal.pt:
                if 0 <= point.idx < count:
                    values[point.idx] = point.v
            return values
    raise ValueError("Unsupported chart data source")


def reference_values(formula, workbook, sheet_name):
    name, (left, top, right, bottom) = range_to_tuple(formula)
    # Never expose data from unreleased sheets or external workbooks.
    if name != sheet_name or (right - left + 1) * (bottom - top + 1) > MAX_POINTS:
        raise ValueError("Chart reference is outside its final-results sheet or too large")
    if left != right and top != bottom:
        raise ValueError("Chart references must be a single row or column")
    return [cell.value for row in workbook[name].iter_rows(min_row=top, max_row=bottom, min_col=left, max_col=right) for cell in row]


def parse_chart(chart, workbook, sheet, index):
    if len(chart._charts) != 1 or len(chart.series) > 30 or not chart.series:
        raise ValueError("Combined or oversized chart")
    if isinstance(chart, BarChart) and chart.type == "col" and chart.grouping == "clustered":
        kind = "bar"
    elif isinstance(chart, LineChart) and chart.grouping == "standard":
        kind = "line"
    else:
        raise ValueError("Unsupported chart type")
    if chart.y_axis.scaling.logBase or chart.x_axis.scaling.logBase:
        raise ValueError("Logarithmic charts are not supported")
    series, categories = [], None
    for position, item in enumerate(chart.series):
        labels = source_values(item.cat, workbook, sheet.title)
        if categories is None:
            categories = [str(value) if value is not None else "" for value in labels]
        elif categories != [str(value) if value is not None else "" for value in labels]:
            raise ValueError("Series category labels differ")
        values = numbers(source_values(item.val, workbook, sheet.title))
        if len(values) != len(categories):
            raise ValueError("Series lengths differ")
        title_values = source_values(item.tx, workbook, sheet.title) if item.tx and item.tx.strRef else []
        title = str(title_values[0]) if title_values and title_values[0] is not None else (getattr(item.tx, "v", None) or f"Series {position + 1}")
        errors = None
        if item.errBars is not None:
            error = item.errBars
            if error.errValType != "cust" or error.errDir not in (None, "y"):
                raise ValueError("Only custom vertical error bars are supported")
            plus = numbers(source_values(error.plus, workbook, sheet.title)) if error.errBarType in ("plus", "both") else [0] * len(values)
            minus = numbers(source_values(error.minus, workbook, sheet.title)) if error.errBarType in ("minus", "both") else [0] * len(values)
            if len(plus) != len(values) or len(minus) != len(values):
                raise ValueError("Error-bar lengths differ")
            if any(value is None or value < 0 for value in plus + minus):
                raise ValueError("Invalid error-bar values")
            errors = [[lower, upper] for lower, upper in zip(minus, plus)]
        series.append({"name": title.strip(), "values": values, "errors": errors})
    return {"id": f"{sheet.title}-{index}", "title": chart_text(chart.title) or f"{sheet.title} — graph {index + 1}",
            "kind": kind, "sheet": sheet.title, "categories": categories, "series": series,
            "x_title": chart_text(chart.x_axis.title), "y_title": chart_text(chart.y_axis.title),
            "y_min": chart.y_axis.scaling.min, "y_max": chart.y_axis.scaling.max}


def extract_workbook_charts(test_id, file_path):
    if not file_path:
        return
    path = Path(file_path).resolve()
    root = Path(os.environ.get("TENANT_DATA_ROOT", "data")).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        return
    stamp = f"v2:{path}:{path.stat().st_mtime_ns}:{path.stat().st_size}"
    with locked_manifest(test_id) as (_, manifest):
        if manifest.get("charts_stamp") == stamp:
            return
        workbook = openpyxl.load_workbook(path, data_only=True)
        charts, warnings = [], []
        try:
            for sheet in workbook:
                if sheet_category(sheet.title) != "final":
                    continue
                for index, chart in enumerate(sheet._charts):
                    if len(charts) >= 100:
                        warnings.append("Only the first 100 final-result graphs are supported.")
                        break
                    try:
                        charts.append(parse_chart(chart, workbook, sheet, index))
                    except (ValueError, TypeError, AttributeError, KeyError):
                        warnings.append(f"Graph {index + 1} on {sheet.title} uses unsupported chart features; consult the workbook.")
        finally:
            workbook.close()
        manifest.update(charts=charts, charts_stamp=stamp, chart_warnings=warnings)