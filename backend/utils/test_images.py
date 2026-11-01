"""Persistent per-test images; no public static mount or database migration.

The manifest is atomic and locked across workers. Images are decoded/re-encoded
as PNG to exclude executable formats and strip metadata. Workbook extraction is
cached, so existing uploads work without reparsing scientific JSON.
"""
import hashlib
import io
import json
import os
import re
import tempfile
import warnings
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
import fcntl

import openpyxl
from PIL import Image

CATEGORIES = ("raw", "processed", "final", "statistics", "conditions")
MAX_BYTES = 15 * 1024 * 1024
MAX_IMAGES = 100


def image_root():
    return Path(os.environ.get("TENANT_DATA_ROOT", "data")).resolve() / "test_images"


def png_bytes(content):
    if len(content) > MAX_BYTES:
        raise ValueError("Image exceeds the 15 MB limit")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in {"PNG", "JPEG", "WEBP", "GIF", "BMP", "TIFF"}:
                raise ValueError("Unsupported image format")
            if image.width * image.height > 25_000_000:
                raise ValueError("Image exceeds 25 megapixels")
            image.seek(0)
            output = io.BytesIO()
            image.convert("RGBA" if "A" in image.getbands() else "RGB").save(output, format="PNG")
            result = output.getvalue()
            if len(result) > MAX_BYTES:
                raise ValueError("Decoded image exceeds the 15 MB limit")
            return result


@contextmanager
def locked_manifest(test_id):
    folder = image_root() / str(int(test_id))
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = folder / "manifest.json"
        manifest = json.loads(path.read_text()) if path.exists() else {"images": []}
        try:
            yield folder, manifest
            with tempfile.NamedTemporaryFile(mode="w", dir=folder, delete=False) as out:
                json.dump(manifest, out)
                temporary = out.name
            os.replace(temporary, path)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def sheet_category(name):
    label = re.sub(r"[^a-z0-9]+", " ", name.lower())
    for pattern, category in [(r"final|results?", "final"), (r"statistic|anova", "statistics"),
                              (r"processed|normalized", "processed"), (r"raw|output", "raw"),
                              (r"condition|information", "conditions")]:
        if re.search(pattern, label):
            return category
    return None


def extract_workbook_images(test_id, file_path):
    """Only explicit sheet names auto-assign categories. Unknown sheets require review."""
    if not file_path:
        return
    path = Path(file_path).resolve()
    data_root = Path(os.environ.get("TENANT_DATA_ROOT", "data")).resolve()
    if not path.is_relative_to(data_root) or not path.is_file():
        return
    stamp = f"{path}:{path.stat().st_mtime_ns}:{path.stat().st_size}"
    with locked_manifest(test_id) as (folder, manifest):
        if manifest.get("workbook_stamp") == stamp:
            return
        workbook = openpyxl.load_workbook(path, data_only=True)
        images, errors = [], []
        try:
            for sheet in workbook:
                ordered = sorted(sheet._images, key=lambda item: (
                    getattr(getattr(item.anchor, "_from", None), "row", 0),
                    getattr(getattr(item.anchor, "_from", None), "col", 0)))
                for index, image in enumerate(ordered):
                    if len(images) >= MAX_IMAGES:
                        errors.append("Workbook has more than 100 images; remaining images were not imported.")
                        break
                    anchor = getattr(image.anchor, "_from", None)
                    row, col = (anchor.row + 1, anchor.col + 1) if anchor else (1, 1)
                    category = sheet_category(sheet.title)
                    try:
                        content = png_bytes(image._data())
                        digest = hashlib.sha256(content).hexdigest()
                        identity = hashlib.sha256(f"{sheet.title}:{row}:{col}:{index}:{digest}".encode()).hexdigest()
                        image_id = "excel-" + identity[:32]
                        (folder / f"{image_id}.png").write_bytes(content)
                        labels = [(r, str(sheet.cell(r, col).value).strip()) for r in range(max(1, row - 20), row + 1)
                                  if isinstance(sheet.cell(r, col).value, str) and not sheet.cell(r, col).value.startswith("=")]
                        caption = next((value for _, value in reversed(labels) if not value.startswith("WP") and len(value) < 160), "")
                        replicates = [(r, str(sheet.cell(r, c).value).strip()) for r in range(max(1, row - 8), min(sheet.max_row, row + 8) + 1)
                                      for c in range(1, min(sheet.max_column, 15) + 1)
                                      if re.fullmatch(r"WP\d+_.+R\d+", str(sheet.cell(r, c).value or "").strip())]
                        replication = min(replicates, key=lambda pair: abs(pair[0] - row))[1] if replicates else None
                        images.append({"id": image_id, "title": caption or f"{sheet.title} — image {index + 1}",
                                       "category": category, "origin": "excel", "sheet": sheet.title,
                                       "anchor": f"{openpyxl.utils.get_column_letter(col)}{row}", "replication": replication})
                    except Exception:
                        errors.append(f"Could not import image {index + 1} from {sheet.title}; use manual upload.")
        finally:
            workbook.close()
        previous = {image["id"]: image for image in manifest["images"] if image["origin"] == "excel"}
        # Preserve administrator corrections for unchanged workbook images.
        images = [{**image, **{k: previous[image["id"]][k] for k in ("title", "category", "hidden") if k in previous.get(image["id"], {})}} for image in images]
        manifest["images"] = [image for image in manifest["images"] if image["origin"] == "manual"] + images
        manifest["workbook_stamp"] = stamp
        manifest["warnings"] = errors
        # Remove stale auto-extracted files after a workbook replacement. Manual
        # files are untouched; hidden images retain tombstones to prevent reimport.
        retained = {image["id"] for image in manifest["images"]}
        for old_id in previous:
            if old_id not in retained:
                (folder / f"{old_id}.png").unlink(missing_ok=True)


def list_images(test_id):
    with locked_manifest(test_id) as (_, manifest):
        return json.loads(json.dumps(manifest))


def add_image(test_id, content, title, category):
    if category not in CATEGORIES:
        raise ValueError("Invalid image category")
    content = png_bytes(content)
    with locked_manifest(test_id) as (folder, manifest):
        if len([i for i in manifest["images"] if not i.get("hidden")]) >= MAX_IMAGES:
            raise ValueError("This test already contains 100 images")
        image = {"id": uuid4().hex, "title": title.strip()[:200] or "Uploaded image", "category": category, "origin": "manual"}
        (folder / f"{image['id']}.png").write_bytes(content)
        manifest["images"].append(image)
        return image


def change_image(test_id, image_id, title=None, category=None, delete=False):
    with locked_manifest(test_id) as (_, manifest):
        image = next((i for i in manifest["images"] if i["id"] == image_id and not i.get("hidden")), None)
        if image is None:
            raise KeyError(image_id)
        if category is not None:
            if category not in CATEGORIES:
                raise ValueError("Invalid image category")
            image["category"] = category
        if title is not None:
            image["title"] = title.strip()[:200] or "Image"
        if delete:
            image["hidden"] = True
        return image