#!/usr/bin/env bash
#
# smoke_test_dev.sh — end-to-end check for the tree + protocol-file feature.
#
# Tuned for the DEV stack (docker-compose-dev.yml): backend on :8001.
# It creates a throwaway category/protocol/test, exercises every endpoint,
# then cleans up after itself.
#
# Requirements on the machine running this: bash, curl, jq.
#
# Usage:
#   ./smoke_test_dev.sh                         # uses defaults below
#   BASE_URL=http://localhost:8001 ./smoke_test_dev.sh
#   ./smoke_test_dev.sh WP3 cms_42a MTT         # real test triple as args
#
# The test triple (work_package / element / test_name) should be one that
# ALREADY EXISTS in your data, so the browse-tree leaf would actually open a
# viewer. If you don't pass one, placeholder values are used — the tree/API
# tests still pass, but clicking the leaf in the UI won't load real data.

set -u

BASE_URL="${BASE_URL:-http://localhost:8001}"
WP="${1:-WP3}"
CMS="${2:-cms_test_001}"
TEST="${3:-MTT}"

# A tiny valid PDF (header + minimal body) for the upload test.
PDF_TMP="$(mktemp /tmp/smoke_XXXX.pdf)"
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$PDF_TMP"
# A non-PDF disguised as .pdf, for the magic-byte rejection test.
FAKE_TMP="$(mktemp /tmp/smoke_XXXX.pdf)"
printf 'this is plainly not a pdf' > "$FAKE_TMP"

pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
no()   { echo "  FAIL  $1"; fail=$((fail+1)); }
hdr()  { echo; echo "=== $1 ==="; }

# json GET helper -> echoes body
g()  { curl -s "$BASE_URL$1"; }
# returns HTTP status only
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

CAT_ID=""; PROTO_ID=""; LINK_ID=""

cleanup() {
  hdr "Cleanup"
  [ -n "$CAT_ID" ] && curl -s -X DELETE "$BASE_URL/categories/$CAT_ID" >/dev/null && \
    echo "  deleted test category $CAT_ID (cascades protocols + links + file)"
  rm -f "$PDF_TMP" "$FAKE_TMP"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
hdr "Layer 1 — API reachable"
if [ "$(code "$BASE_URL/tree")" = "200" ]; then ok "GET /tree returns 200"
else no "GET /tree not reachable at $BASE_URL (is the dev backend up on 8001?)"; echo; echo "Aborting."; exit 1; fi

# ---------------------------------------------------------------------------
hdr "Layer 2 — Create category / protocol / test link"

CAT_ID=$(curl -s -X POST "$BASE_URL/categories" \
  -H 'Content-Type: application/json' \
  -d '{"name":"__SMOKE_TEST__","sort_order":999}' | jq -r '.id // empty')
[ -n "$CAT_ID" ] && ok "created category id=$CAT_ID" || no "create category"

PROTO_ID=$(curl -s -X POST "$BASE_URL/protocols" \
  -H 'Content-Type: application/json' \
  -d "{\"category_id\":$CAT_ID,\"name\":\"Smoke Protocol\",\"description\":\"temp\"}" \
  | jq -r '.id // empty')
[ -n "$PROTO_ID" ] && ok "created protocol id=$PROTO_ID" || no "create protocol"

LINK_ID=$(curl -s -X POST "$BASE_URL/protocol-tests" \
  -H 'Content-Type: application/json' \
  -d "{\"protocol_id\":$PROTO_ID,\"work_package_name\":\"$WP\",\"element_cms_id\":\"$CMS\",\"test_name\":\"$TEST\"}" \
  | jq -r '.id // empty')
[ -n "$LINK_ID" ] && ok "attached test link id=$LINK_ID ($WP/$CMS/$TEST)" || no "attach test"

# uniqueness: attaching the SAME triple again must 409
DUP=$(code -X POST "$BASE_URL/protocol-tests" \
  -H 'Content-Type: application/json' \
  -d "{\"protocol_id\":$PROTO_ID,\"work_package_name\":\"$WP\",\"element_cms_id\":\"$CMS\",\"test_name\":\"$TEST\"}")
[ "$DUP" = "409" ] && ok "duplicate test link rejected (409)" || no "duplicate not rejected (got $DUP, expected 409)"

# ---------------------------------------------------------------------------
hdr "Layer 3 — Tree shape & renaming"

TREE=$(g "/tree")
FOUND=$(echo "$TREE" | jq --arg id "$CAT_ID" '[.[] | select(.id == ($id|tonumber))] | length')
[ "$FOUND" = "1" ] && ok "new category appears in GET /tree" || no "category missing from tree"

# rename category
curl -s -X PATCH "$BASE_URL/categories/$CAT_ID" \
  -H 'Content-Type: application/json' -d '{"name":"__SMOKE_RENAMED__","sort_order":999}' >/dev/null
NEWNAME=$(g "/tree" | jq -r --arg id "$CAT_ID" '.[] | select(.id==($id|tonumber)) | .name')
[ "$NEWNAME" = "__SMOKE_RENAMED__" ] && ok "category rename persisted" || no "category rename (got '$NEWNAME')"

# rename test label — display_name is a QUERY PARAM
curl -s -X PATCH "$BASE_URL/protocol-tests/$LINK_ID/rename?display_name=Renamed%20Label" >/dev/null
DISP=$(g "/tree" | jq -r --arg id "$LINK_ID" '.[].protocols[].tests[] | select(.id==($id|tonumber)) | .display_name')
REAL=$(g "/tree" | jq -r --arg id "$LINK_ID" '.[].protocols[].tests[] | select(.id==($id|tonumber)) | .test_name')
[ "$DISP" = "Renamed Label" ] && ok "test display_name updated" || no "display_name (got '$DISP')"
[ "$REAL" = "$TEST" ] && ok "real test_name UNCHANGED ($REAL) — data fetch stays intact" || no "test_name mutated! (got '$REAL')"

# ---------------------------------------------------------------------------
hdr "Layer 4 — File upload / inline serve / validation"

UP=$(curl -s -X POST "$BASE_URL/protocols/$PROTO_ID/file" -F "file=@$PDF_TMP;type=application/pdf")
UPNAME=$(echo "$UP" | jq -r '.file_name // empty')
[ -n "$UPNAME" ] && ok "PDF uploaded (file_name=$UPNAME)" || no "PDF upload ($UP)"

# has_file now true in the tree, and file_mime present
HASFILE=$(g "/tree" | jq -r --arg id "$PROTO_ID" '.[].protocols[] | select(.id==($id|tonumber)) | .has_file')
MIME=$(g "/tree" | jq -r --arg id "$PROTO_ID" '.[].protocols[] | select(.id==($id|tonumber)) | .file_mime')
[ "$HASFILE" = "true" ] && ok "tree shows has_file=true" || no "has_file not true"
[ "$MIME" = "application/pdf" ] && ok "tree shows file_mime=application/pdf" || no "file_mime (got '$MIME')"

# THE critical inline check — header must be 'inline', not 'attachment'
DISP_HDR=$(curl -sI "$BASE_URL/protocols/$PROTO_ID/file" | tr -d '\r' | grep -i '^content-disposition:')
echo "$DISP_HDR" | grep -qi 'inline' && ok "download serves Content-Disposition: inline (PDF will embed)" \
  || no "NOT inline — got '${DISP_HDR:-<none>}'. PDF would download instead of embedding. Restart backend?"

# magic-byte rejection: non-PDF disguised as .pdf must 415
BADCODE=$(code -X POST "$BASE_URL/protocols/$PROTO_ID/file" -F "file=@$FAKE_TMP;type=application/pdf")
[ "$BADCODE" = "415" ] && ok "fake PDF rejected (415)" || no "fake PDF not rejected (got $BADCODE, expected 415)"

# file landed on host? (dev path)
if [ -d "./backend/protocol_files" ]; then
  CNT=$(ls -1 ./backend/protocol_files 2>/dev/null | grep -c "^${PROTO_ID}_" || true)
  [ "$CNT" -ge 1 ] && ok "file present on host at ./backend/protocol_files" \
    || no "no file matching ${PROTO_ID}_* on host (volume mount wired?)"
else
  echo "  SKIP  ./backend/protocol_files not found from here — check the mount manually"
fi

# delete the file
DELCODE=$(code -X DELETE "$BASE_URL/protocols/$PROTO_ID/file")
[ "$DELCODE" = "200" ] && ok "file delete returns 200" || no "file delete (got $DELCODE)"
AFTER=$(g "/tree" | jq -r --arg id "$PROTO_ID" '.[].protocols[] | select(.id==($id|tonumber)) | .has_file')
[ "$AFTER" = "false" ] && ok "has_file back to false after delete" || no "has_file still '$AFTER' after delete"

# ---------------------------------------------------------------------------
hdr "Layer 5 — Cascade delete"
# deleting the category should remove its protocols + links (FK cascade)
curl -s -X DELETE "$BASE_URL/categories/$CAT_ID" >/dev/null
GONE=$(g "/tree" | jq --arg id "$CAT_ID" '[.[] | select(.id==($id|tonumber))] | length')
[ "$GONE" = "0" ] && { ok "category + children cascade-deleted"; CAT_ID=""; } || no "category still present after delete"

# ---------------------------------------------------------------------------
echo
echo "==================================================="
echo "  RESULTS:  $pass passed, $fail failed"
echo "==================================================="
[ "$fail" -eq 0 ] && echo "All backend checks green. Now do the UI pass (see notes below)." \
  || echo "Fix the FAILs above before testing the UI — the pages just wire to these."
echo
echo "UI pass (manual, dev frontend on :3001):"
echo "  ProtocolManager  — hover a name -> pencil -> rename; upload a PDF -> View embeds it; delete protocol."
echo "  TestNavigationTree — expand to a test -> leaf opens the right DataViewer;"
echo "                       renamed label shows but viewer still loads; 'View SOP' embeds, no upload control."
exit "$([ "$fail" -eq 0 ] && echo 0 || echo 1)"