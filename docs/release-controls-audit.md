# Test section release-control audit

Date: 2026-09-14

## Contract

A test must be public before a public viewer can discover or read it. Once the
row is public, these five controls operate independently:

| Release control | Canonical response section |
|---|---|
| `release_test_details` | `test_details` |
| `release_raw_data` | `raw_data` |
| `release_processed_data` | `processed_data` |
| `release_final_results` | `final_results` |
| `release_statistical_analysis` | `statistical_analysis` |

For a public viewer, a control set to `true` exposes only its matching section.
A control set to `false` withholds its matching section, regardless of the other
four controls. The sole metadata exception is a fixed report-header projection
inside `test_details`: full test name, acronym, type, endpoint, endpoint outcome,
SOP, and ERM identifier remain available so public reports can be identified.
The `release_test_details` flag still exclusively controls the Test Conditions
tab and all other test-detail fields. Empty or `null` content does not change a
control's state: a released empty section remains an available section with an
empty-state message.

Team users and administrators have authorized private access and continue to see
the complete stored test record. API Explorer `/v1` reads are separately governed
by scopes, tenant isolation, and explicit resource grants; they are not public
publication reads.

Making a test private is the sole intentional coupling: it revokes all five
release grants so stale grants cannot reactivate during a later publication.

## Audited test inventory

The parser registry, administrator create-test options, and client viewer
registry contain the same 19 canonical test types:

1. Algae
2. DLS
3. DSC
4. FTIR
5. HR-STEM
6. MNT
7. MTT
8. ROS
9. Rotifier
10. SIMS
11. TB
12. TB-Microfludic
13. TGA
14. UPS
15. UV-VIS
16. WaterFlea
17. XPS
18. XRD
19. ZETA

Parser output is normalized at upload into the five canonical database fields.
In particular, each parser's `replications` output is stored as `raw_data`.

## Enforcement points

- `backend/api/services/test.py::mask_test_for_public` is the single public
  field-projection function.
- Public reads by ID, name, public list, work package, and listing selection all
  use that projection.
- Create and update forms submit all five booleans independently.
- Partial JSON updates use Pydantic's `exclude_unset=True`, so changing one flag
  preserves the other four.
- Public, team, and administrator accounts use the same specialized scientific
  viewer whenever that viewer supports every section present in the authorized
  response. This keeps charts, tables, and downloads consistent across roles.
- `PublicReleasedDataViewer` performs a release-aware precheck for public
  accounts. It uses the specialized viewer for complete compatible responses
  and remains a fail-safe for partial combinations that a legacy specialized
  viewer cannot yet render safely. TB and TB-Microfluidic are partial-release
  safe and always use their specialized viewers.
- When the fail-safe is needed, tabs are generated strictly from the five
  response flags, the first released tab is selected automatically, and each
  section renders without reading another section.

## Regression coverage

Automated tests cover:

- every test type × every single release flag (19 × 5 = 95 cases);
- all 32 possible combinations of the five flags;
- independent persistence updates for each of the five flags;
- the actual `/tests/listings` service detail branch;
- parser-output normalization to all five canonical fields;
- private-test fail-closed behavior and release-grant revocation;
- registry parity between parsers, create options, and viewers (validated during
  the audit).
