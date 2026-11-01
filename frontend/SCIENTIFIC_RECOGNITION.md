# Scientific content recognition

The PCR, ANNX and PCR-Microfludic pages use `src/lib/scientificRecognition.ts`
inside their existing Raw Data, Processed Data, Final Results and Statistical
Analysis tabs. Test Conditions and the existing CSS/classes are unchanged.
The shared content component is not a replacement page or new viewer registry.

- Explicit conditions-row column relationships identify samples/treatments and
  target/reference genes; no sample-number-to-treatment assumption is made.
- Measurements group by endpoint, unit and replicate versus reported summary.
  Final outcomes remain separate from intermediate processed values.
- Flow exports group by population/gate and then population measurements,
  channel statistics, acquisition metadata or unrecognized fields. Biological
  gate labels come from the workbook's final-result mapping, not a new quadrant
  interpretation. Export fields retain their original normalized header names;
  unspecified instrument units are not guessed.
- Statistical panels use explicit endpoint headings and recognized method
  labels. Each original statistical cell (including formulas and null caches)
  belongs to exactly one panel/method group or the unassigned-source fallback.
  Statistical significance is never recalculated or inferred.
- Charts keep their existing controls; source tables remain available in
  collapsed supporting-source sections and can still be downloaded in full.
  New content tables are unpaginated. No missing value is converted to zero.

## Images

The actual asset root is `frontend/public/images`, not a `work package`
subdirectory. `npm run build` first indexes real files and SHA-256 identities
using `scripts/index-test-images.mjs`. Run that script after adding public images
when using development mode. Real case-sensitive paths are URL-encoded.
`resolveScientificImages` extends the existing image configuration, and the
existing `UniversalImagesTab` retains its presentation/lightbox.

Category associations require explicit raw/processed/final/statistics filename
tokens or a byte-identical embedded workbook image, plus matching work package,
material and test identity. Hashes alone cannot match logos across experiments.
The parser adds optional SHA-256/sheet/anchor metadata to source tables without
extracting or duplicating images. Existing persisted records work without it;
Excel replacement is needed to obtain hashes for old uploads.

There currently are no matching PCR/ANNX public images. Missing images render
nothing; no related-looking image from a different assay is substituted.
Re-encoded/resized images are deliberately not matched heuristically.

## Validation

From `frontend`:

```sh
node scripts/test-scientific-recognition.cjs
```

Optional arguments are JSON files emitted by the existing PCR/ANNX parsers. The
runner checks complete measurement preservation, statistical-cell partitioning,
explicit relationships and real image paths. It requires only installed project
dependencies. Other viewers can reuse the recognition functions with their
existing source/measurement adapters; their independent formats are unchanged.

Unrecognized scientific layouts remain source fallbacks rather than fabricated
normalized results. This is deterministic, header-based recognition, not a
general biological inference engine. Other test viewers are not automatically
rewritten or restyled.