# ANNX and PCR workbook integration

The canonical platform identifiers are `ANNX` and `PCR`. Parser modules follow
the existing `parsers/<test>.py` convention. Both are registered in the existing
controller `PARSERS` dictionary, used by both POST creation and PUT replacement.
The existing payload adapter maps `replications` to the persisted `raw_data`
column. No migrations or additional endpoints are needed.

## Scientific interpretation

- ANNX accepts the supplied Annexin V/DAPI template, including `WP3_ANX_*`
  identifiers. Output sheets contain CSV-in-cell instrument exports; processed
  sheets contain split-column exports. `%Total` and `%Gated` remain distinct.
  Gate charts use `%Gated`, not `%Total`. The final sheet identifies early
  apoptotic, viable, late apoptotic and primary necrotic populations, replicate
  percentages, acceptance criteria, and reported mean/SD summaries.
- PCR reads `Mean Ct` headers from raw sheets and `Fold change vs CTRL` headers
  from processed sheets, including their different row positions. Housekeeping
  and target genes are preserved as written. Raw `Sample 1` through `Sample 4`
  labels are not silently replaced with treatment names; the mapping and
  concentration units remain in the conditions section. Final measurements
  include replicate values and workbook-reported mean/SD, not recomputed values.
- Statistical sheets are retained as coordinate-preserving tables, including
  ANOVA summaries, variance tests, comparisons, confidence intervals and
  significance labels wherever present. No statistical results are inferred
  from empty template fields, and no new statistical tests are run.

Every populated worksheet cell is retained under a `source` table with original
coordinates, cached values, formula text where applicable, and merged ranges.
Formatting-only trailing rows are omitted. Dates normalize to ISO calendar
dates. Missing formula caches are null with warnings: openpyxl cannot calculate
Excel formulas. Warnings also identify malformed dates, known spelling/encoding
issues, ambiguous headers and processed/final measurement disagreements.

Embedded workbook drawings/images are not extracted into the JSON payload.
The original uploaded Excel workbook remains the source for representative
dot-plot images. These parsers and charts operate on scientific cell data.

## Frontend

`ANNXDataViewer` in `annx/page.tsx` and `PCRDataViewer` in `pcr/page.tsx` each
own their fetching, state, tabs and page layout, matching the other test viewers.
Each page includes its own types, tables, charts and CSV utilities, without a
shared assay viewer, and uses the existing authenticated API client and
`/tests/listings` contract. The existing
role-aware public-release wrapper remains in force; section restrictions are
not bypassed. The update modal imports the create modal's shared test options.

Viewers provide conditions, raw, processed, final and optional statistics tabs,
replicate/endpoint selectors, charts with reported SD, and complete CSV exports.
Source previews paginate at 50 nonempty rows; measurement previews cap at 200
and charts at 100 points without truncating downloaded data. CSV formula-like
text is escaped to prevent spreadsheet formula execution.

## Validation

Run tests from the backend directory with its existing development dependencies:

```sh
PYTHONPATH=. python -m pytest tests/test_cell_assay_parsers.py tests/test_cell_assay_integration.py
```

The fixtures generate workbooks locally and do not require private input files.
Lifecycle tests exercise parser dispatch, creation, Excel replacement, payload
mapping, schema serialization, retrieval and failed-upload cleanup with mocked
persistence. They are not live PostgreSQL or browser tests.

For standalone parsing, from the backend directory:

```sh
python -m parsers.annx /absolute/path/to/annx.xlsx
python -m parsers.pcr /absolute/path/to/pcr.xlsx
```

The two provided PCR workbooks contain different measurements for the same
material/test identity. Upload one as PCR and use Excel replacement to switch
versions; these parsers do not merge the datasets or alter listing uniqueness.