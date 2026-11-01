# Managed test images

`GET /test-images?work_package=...&element=...&test_name=...` imports supported
embedded worksheet pictures from the existing stored Excel file on first access,
then caches the manifest until that workbook changes. This applies to every
registered test type, including existing uploads. No scientific JSON reparse or
schema migration is required. The workbook must still exist under
`TENANT_DATA_ROOT`; missing historical uploads cannot be reconstructed.

Images are stored beneath `TENANT_DATA_ROOT/test_images/<database-test-id>/`, on
the existing persistent research-data volume. The directory is not mounted as a
public static folder. File reads recheck the test's visibility and matching
section-release flag. Authenticated private-data users retain their existing
access; upload/edit/removal requires administrator access, matching Back Office.
Cookie-authenticated mutations use the application's existing Origin protection.

Back Office → Test Images allows selecting any uploaded test, uploading an
image, choosing its section, changing its title/category, and removing it.
Unknown worksheet names remain unassigned until an administrator reviews them.
Recognized raw/output, processed, final/results, statistics and conditions sheets
are assigned automatically. A conditions-sheet logo is never moved into results.
Captions and nearest replicate identifiers are read from nearby workbook cells;
administrators can correct the title/category. No image-content inference is made.

Native Excel clustered column and standard line charts on recognized final-results
sheets are also read and rendered as interactive graphs in Final Results, separate
from the image gallery. Series values, labels, axis titles/limits and custom vertical
error bars come from the workbook; formulas are not evaluated. References outside
the graph's final-results sheet are rejected so unreleased sections cannot leak
through chart data. Unsupported chart types/features produce administrator warnings
rather than being silently converted to misleading graphs. Styling is not an exact
Excel reproduction. Graphs share the final-results release flag, and refresh lazily
for existing workbooks; no scientific-data reparse is required.

Only actual embedded raster pictures supported by openpyxl/Pillow are imported as
images. Drawing objects, externally linked pictures and screenshots not
embedded in the workbook cannot be extracted by this implementation. Uploaded
PNG/JPEG/WebP/GIF/BMP/TIFF images are decoded and saved as PNG (first GIF/TIFF
frame only), with a 15 MB input/output limit and 25-megapixel limit. Up to 100
images per workbook are imported. Unsupported pictures produce admin warnings.

Pillow is an explicit runtime dependency: previously the production requirements
did not include it, so embedded images could be skipped by openpyxl. No uploaded
research images are committed to Git or copied into frontend public assets.

Removal hides an image and keeps a tombstone, preventing the same workbook from
silently restoring it. Unchanged images retain administrator corrections during
workbook refresh. Files belonging to removed auto-imported images are cleaned up
when a replacement workbook is scanned. Manually uploaded images survive Excel
replacement; database test IDs, not display labels, own image collections.

The ANNX viewer follows workbook order: replicate/sample flow tables, three
population-by-treatment experiment tables, a reported Mean/SD table, acceptance
criteria, and endpoint-separated statistics. Workbook coordinates and full
instrument metadata remain collapsed, not shown as default scientific content.

Validation:

```sh
# From backend
PYTHONPATH=. python -m pytest tests/test_test_images.py
# From frontend; argument is the output of parsers.annx for the reference workbook
node scripts/test-annexin-workbook.cjs /absolute/path/to/annx-parser-output.json
```