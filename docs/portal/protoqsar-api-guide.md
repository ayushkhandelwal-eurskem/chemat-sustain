# ProtoQSAR guide: reading CheMatSustain test data

This guide is for ProtoQSAR users. It starts from the beginning and assumes you
have not used an API before.

## 1. What you receive

Each ProtoQSAR user receives their own two credential values:

```text
client_id:     cms_...
client_secret: ...
```

These values are different from your website email and password.

- The **client ID** identifies your API credential.
- The **client secret** proves that you are allowed to use it.
- Treat the client secret like a password.
- Do not share credentials with another user. Every ProtoQSAR user has their own.
- Never put the secret in source code, Git, screenshots, email, or support tickets.

Your credential can read:

- the complete test catalogue;
- experimental data for every test.

It does not grant protocol or shared-file access.

You can also use the browser-based API Explorer without signing into the main
website:

```text
https://database.eurskem.com/api-explorer
```

The Explorer still asks for your issued API client ID and client secret. It
keeps them only in the current page's memory and removes them when the page is
refreshed or closed.

### Accessing the new API Explorer UI

The API Explorer is the easiest option when you want to inspect or download
data without writing code:

1. Open a current version of Chrome, Edge, Firefox, or Safari.
2. Go to
   `https://database.eurskem.com/api-explorer`. You do not need to sign into the
   main CheMatSustain website first.
3. In the **API credential** card, enter your issued **Client ID** and **Client
   secret**. These are not your website email address and password.
4. Select **Test credentials**. A successful check loads the complete live
   lightweight index, fills the test-name selector with the names currently in
   the database, and displays a green **Credential accepted** message. If you
   receive `401 Unauthorized`, copy both values again and make sure there are no
   leading or trailing spaces.
5. Leave **All test names** selected and the Test ID empty to keep the complete
   index visible. Select **Run index API** whenever you want to rerun the current
   filter.
6. To filter by name, choose a value such as `MTT` and select **Run index API**
   again. Name matching is exact but is not case-sensitive.
7. To look up a numeric ID, enter it in **Test ID** and select **Run index API**.
   You may combine a test name and ID; both conditions must match.
8. Select **Open** on a result row, or enter an ID and select **Open test ID**, to
   retrieve the complete record for that one test.
9. Use **JSON** to download the index or complete record. In the complete-record
   panel, **Copy** places the displayed JSON on the clipboard.
10. In **Python test**, use **Copy** or **Download .py** to obtain a script based
    on the selected filters. The generated script reads credentials from
    environment variables and never contains the secret entered in the page.

Select the bin icon to clear the credentials and results immediately. Closing
or refreshing the tab also removes the credentials. The browser does not put
them in cookies, browser storage, URLs, generated scripts, or downloaded JSON.

> Do not use the Explorer on a shared or public computer. Do not take a
> screenshot while the client secret is visible.

## 2. The API address

The base address is:

```text
https://database.eurskem.com/api/v1
```

An **endpoint** is a path added to this address. For example, the tests endpoint
is:

```text
https://database.eurskem.com/api/v1/tests
```

All examples below use HTTPS. Do not change it to HTTP.

## 3. Easiest first test: curl

`curl` is a small command-line tool for making web requests. It is already
installed on macOS and most Linux systems. On current Windows versions, use it
in PowerShell or Windows Terminal.

### macOS or Linux

Open Terminal and enter these commands. The second command hides the secret as
you type, and neither credential value is written literally into shell history:

```bash
read -r -p 'Client ID: ' CHEMAT_CLIENT_ID
read -r -s -p 'Client secret: ' CHEMAT_CLIENT_SECRET; echo
export CHEMAT_CLIENT_ID CHEMAT_CLIENT_SECRET
```

Paste each issued value at its prompt and press Enter. Nothing is displayed
while you paste the client secret.

Check your credential:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/portal/me'
```

Then request the complete lightweight live test index:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/test-index'
```

You should receive JSON: structured text beginning with `[` for a list or `{`
for one object. A successful request has HTTP status `200`.

When finished, remove the values from the current terminal session:

```bash
unset CHEMAT_CLIENT_ID CHEMAT_CLIENT_SECRET
```

### Windows PowerShell

Open PowerShell and enter:

```powershell
$env:CHEMAT_CLIENT_ID = 'cms_your_client_id_here'
$env:CHEMAT_CLIENT_SECRET = 'your_client_secret_here'
```

Check your credential:

```powershell
curl.exe --fail-with-body --user "$($env:CHEMAT_CLIENT_ID):$($env:CHEMAT_CLIENT_SECRET)" `
  "https://database.eurskem.com/api/v1/portal/me"
```

Request the complete lightweight live test index:

```powershell
curl.exe --fail-with-body --user "$($env:CHEMAT_CLIENT_ID):$($env:CHEMAT_CLIENT_SECRET)" `
  "https://database.eurskem.com/api/v1/test-index"
```

When finished:

```powershell
Remove-Item Env:CHEMAT_CLIENT_ID
Remove-Item Env:CHEMAT_CLIENT_SECRET
```

### Production backend terminal (administrators only)

This subsection is only for an authorised administrator who already has shell
access to the CheMatSustain production host. ProtoQSAR users should use the
public HTTPS commands above; they do not need server access.

On the production host, change to the deployment directory:

```bash
cd /home/chematsustain
```

Read the client ID normally and the client secret without displaying it on the
screen. Neither value is written literally into the shell history:

```bash
read -r -p 'Client ID: ' CHEMAT_CLIENT_ID
read -r -s -p 'Client secret: ' CHEMAT_CLIENT_SECRET; echo
export CHEMAT_CLIENT_ID CHEMAT_CLIENT_SECRET
```

The hardened backend container does not include `curl`. Use its installed
Python `requests` library to check the credential against the backend process
inside that same container:

```bash
docker compose exec -T \
  -e CHEMAT_CLIENT_ID -e CHEMAT_CLIENT_SECRET \
  backend python -c '
import os
import requests

response = requests.get(
    "http://127.0.0.1:8000/v1/portal/me",
    auth=(os.environ["CHEMAT_CLIENT_ID"], os.environ["CHEMAT_CLIENT_SECRET"]),
    timeout=30,
)
response.raise_for_status()
print(response.json())
'
```

Retrieve the unlimited lightweight index from the backend terminal:

```bash
docker compose exec -T \
  -e CHEMAT_CLIENT_ID -e CHEMAT_CLIENT_SECRET \
  backend python -c '
import os
import requests

response = requests.get(
    "http://127.0.0.1:8000/v1/test-index",
    auth=(os.environ["CHEMAT_CLIENT_ID"], os.environ["CHEMAT_CLIENT_SECRET"]),
    timeout=30,
)
response.raise_for_status()
tests = response.json()
print(f"Returned {len(tests)} tests")
print(tests[:3])
'
```

The `http://127.0.0.1:8000` address is appropriate only inside the backend
container because the traffic never leaves that container. All partner and
internet access must continue to use
`https://database.eurskem.com/api/v1`; never expose port 8000 publicly.

When finished, remove the credential from the host shell:

```bash
unset CHEMAT_CLIENT_ID CHEMAT_CLIENT_SECRET
```

## 4. Available methods

All ProtoQSAR requests use the HTTP method `GET`. `GET` means “read”; these
requests do not create, update, or delete test records.

| Method and endpoint | Purpose |
|---|---|
| `GET /portal/me` | Check that the credential works |
| `GET /test-index` | Return every accessible test's ID, name, Work Package and identifier; no pagination limit |
| `GET /test-index?test_name=MTT` | Return every accessible test with one test name |
| `GET /test-index?test_id=3` | Look up the lightweight identity fields for one test ID |
| `GET /tests?limit=25&offset=0` | Read one page of test summaries |
| `GET /tests/{test_id}` | Read the complete data and identity fields for one test |
| `GET /experimental-data/{test_id}` | Read detailed data for one test |

Replace `{test_id}` with the numeric `id` returned by `/tests`. For example:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/experimental-data/3'
```

For new integrations, use the complete single-test endpoint because it includes
the ID, test name, Work Package and identifier alongside the data:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/tests/3'
```

### Unlimited live index

Unlike `/tests`, the lightweight `/test-index` endpoint has no pagination
limit. It is the authoritative live list and automatically includes tests added
after this PDF was generated:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/test-index'
```

Filter it by test name:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/test-index?test_name=MTT'
```

Each index item contains:

```json
{
  "test_id": 3,
  "test_name": "MTT",
  "work_package": "WP3",
  "identifier": "CMS_4a_AuNP"
}
```

## 5. Understanding the test response

`GET /tests` returns a JSON list. Each item can contain:

| Field | Meaning |
|---|---|
| `id` | Numeric identifier used by the experimental-data endpoint |
| `organisation_id` | Owning organisation, if assigned; legacy records may be `null` |
| `work_package_name` | CheMatSustain work package |
| `element_cms_id` | Consortium element/reference identifier |
| `test_name` | Name or type of test |
| `test_details` | Summary/details of the test |
| `final_results` | Final result summary, if present |
| `statistical_analysis` | Statistical analysis, if present |
| `created_at` | Creation time |
| `updated_at` | Last update time |

`GET /experimental-data/{test_id}` can additionally return `raw_data` and
`processed_data`. A field may be `null` when no value has been entered.

## 6. Pagination: obtaining every test

The API returns at most 25 tests per request. This is called **pagination**.

- `limit=25` asks for 25 records.
- `offset=0` starts at the first record.
- The next page uses `offset=25`, then `50`, `75`, and so on.
- Stop when a page contains fewer than 25 records.

Example second page:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/tests?limit=25&offset=25'
```

Do not set `limit` above 25; the API will reject it.

## 7. Python: download the unlimited live test index

Install Python 3, then install the `requests` package once:

```bash
python3 -m pip install requests
```

Create a file named `download_test_index.py` with this complete program:

```python
import json
import os

import requests

BASE_URL = "https://database.eurskem.com/api/v1"
CLIENT_ID = os.environ["CHEMAT_CLIENT_ID"]
CLIENT_SECRET = os.environ["CHEMAT_CLIENT_SECRET"]

response = requests.get(
    f"{BASE_URL}/test-index",
    auth=(CLIENT_ID, CLIENT_SECRET),
    timeout=30,
)
response.raise_for_status()
tests = response.json()

with open("chematsustain_test_index.json", "w", encoding="utf-8") as output:
    json.dump(tests, output, indent=2, ensure_ascii=False)

print(f"Saved {len(tests)} tests to chematsustain_test_index.json")
```

Set the environment variables as shown in section 3, then run:

```bash
python3 download_test_index.py
```

The program creates `chematsustain_test_index.json` in the current directory.
There is no pagination loop or result limit. It does not write your secret into
that output file.

## 8. Python: retrieve experimental data

This example downloads test `3`. Change `TEST_ID` to the test you need:

```python
import json
import os

import requests

TEST_ID = 3
response = requests.get(
    f"https://database.eurskem.com/api/v1/experimental-data/{TEST_ID}",
    auth=(os.environ["CHEMAT_CLIENT_ID"], os.environ["CHEMAT_CLIENT_SECRET"]),
    timeout=30,
)
response.raise_for_status()

with open(f"experimental_data_{TEST_ID}.json", "w", encoding="utf-8") as output:
    json.dump(response.json(), output, indent=2, ensure_ascii=False)
```

## 9. Optional: save basic test fields as CSV

After downloading `chematsustain_test_index.json`, this program creates a spreadsheet-
friendly CSV file:

```python
import csv
import json

with open("chematsustain_test_index.json", encoding="utf-8") as source:
    tests = json.load(source)

columns = [
    "test_id",
    "test_name",
    "work_package",
    "identifier",
]

with open("chematsustain_tests.csv", "w", newline="", encoding="utf-8-sig") as output:
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(tests)
```

Open the resulting `chematsustain_tests.csv` in Excel or LibreOffice Calc.

## 10. Postman (no programming)

1. Open Postman and choose **New** → **HTTP Request**.
2. Set the method to **GET**.
3. Enter:
   `https://database.eurskem.com/api/v1/tests?limit=25&offset=0`
4. Open the **Authorization** tab.
5. Choose **Basic Auth**.
6. Put your `client_id` in **Username**.
7. Put your `client_secret` in **Password**.
8. Click **Send**.
9. Confirm the response status is **200 OK**.

Avoid saving or synchronising a Postman collection containing the real secret.
Prefer Postman’s local/environment secret variables if you need to reuse it.

## 11. Common errors

| Status or symptom | Meaning | What to do |
|---|---|---|
| `200 OK` | Request worked | Use the returned JSON |
| `401 Unauthorized` | Client ID/secret is wrong, disabled, or was copied with extra spaces | Copy both values again; if still failing, contact Eurskem |
| `403 Forbidden` | Credential lacks the required scope or resource access | Contact Eurskem; repeatedly retrying will not help |
| `404 Not Found` | Test ID/path does not exist, or is not visible | Check the ID came from `/tests` and check the URL |
| `422 Unprocessable Entity` | Invalid pagination, such as `limit` above 25 or negative `offset` | Use `limit=25` and an `offset` of 0 or more |
| `500 Internal Server Error` | Server-side problem | Record the time and endpoint, then contact Eurskem; do not send your secret |
| Empty list `[]` | The request worked but returned no records on that page | If paginating, you have reached the end |
| Request times out | Network/VPN/firewall issue or temporary service issue | Retry once; then send the time and endpoint to support |

When requesting support, provide:

- your work email;
- endpoint/path (without credentials);
- HTTP status;
- approximate time and timezone;
- a short description of what you expected.

Never include the client secret in a message or screenshot.

## 12. Security and credential rotation

- Store the secret in a password manager or approved secret manager.
- Use environment variables for scripts; do not paste the secret into Python.
- Add `.env` files to `.gitignore` before using them.
- Do not disable TLS certificate verification (`verify=False`, `-k`, or
  `--insecure`).
- Do not share one user’s credential among colleagues.
- If a secret is lost or may have been exposed, stop using it and notify Eurskem
  immediately. Eurskem will disable it and issue a replacement; secrets cannot
  be recovered from the server.

Support contact: **ayush.khandelwal@eurskem.com**

## 13. Worked example: open one test from the list

The appendix below contains every available `test_id` with its associated
`test_name`, Work Package number and material identifier. The same test name can
appear more than once, so always use the numeric ID and identifier from the row
you want.

For example, the first row is:

| Test ID | Test name | Work Package | Identifier |
|---:|---|---|---|
| `3` | MTT | WP3 | CMS_4a_AuNP |

To open the experimental data for this exact test, replace `{test_id}` with `3`.

### With curl (macOS or Linux)

After setting `CHEMAT_CLIENT_ID` and `CHEMAT_CLIENT_SECRET` as shown in section 3:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/experimental-data/3'
```

### With Postman

1. Create a new **GET** request.
2. Enter:
   `https://database.eurskem.com/api/v1/experimental-data/3`
3. Open **Authorization** and select **Basic Auth**.
4. Enter your `client_id` as **Username**.
5. Enter your `client_secret` as **Password**.
6. Click **Send**.
7. A successful response says **200 OK** and returns JSON for test ID `3`.

The endpoint is not a normal public web page, so pasting it into a browser
without API authentication returns `401 Unauthorized`. Use curl, Postman, or the
Python method from section 8.

## 14. Complete test index

This list was exported from the live production CheMatSustain `/api/v1/test-index`
endpoint. It contains all 327 tests available when this guide was generated,
with each test's numeric ID, test name, Work Package number and material identifier.
It is a dated reference, not the live source. Use `/api/v1/test-index` or the API
Explorer to see tests added later. Test IDs are permanent record identifiers but are
not consecutive. Repeated test names, Work Packages and identifiers are expected.

| Test ID | Test name | Work Package | Identifier |
|---:|---|---|---|
| `3` | MTT | WP3 | CMS_4a_AuNP |
| `4` | MTT | WP3 | CMS_3a_AuNP |
| `5` | MTT | WP3 | CMS_2a_AuNP |
| `6` | MTT | WP3 | CMS_5a_AuNP |
| `7` | MTT | WP3 | CMS_6a_AuNP |
| `8` | MTT | WP3 | CMS_15a_TNR |
| `9` | MTT | WP3 | CMS_16a_TMR |
| `10` | MTT | WP3 | CMS_17a_TNA |
| `12` | MTT | WP3 | CMS_26a_CH_CIT |
| `14` | MTT | WP3 | CMS_27a_CH_PEG |
| `16` | MTT | WP3 | CMS_18a_TNA |
| `28` | DLS | WP2 | CMS_1a_AuNP |
| `32` | DLS | WP2 | CMS_2a_AuNP |
| `36` | DLS | WP2 | CMS_3a_AuNP |
| `37` | MTT | WP3 | CMS_1a_AuNP |
| `41` | FTIR | WP2 | CMS_1a_AuNP |
| `42` | FTIR | WP2 | CMS_2a_AuNP |
| `43` | FTIR | WP2 | CMS_3a_AuNP |
| `44` | FTIR | WP2 | CMS_4a_AuNP |
| `45` | FTIR | WP2 | CMS_6a_AuNP |
| `46` | FTIR | WP2 | CMS_5a_AuNP |
| `47` | FTIR | WP2 | CMS_15a_TNR |
| `48` | FTIR | WP2 | CMS_16a_TMR |
| `49` | FTIR | WP2 | CMS_17a_TNA |
| `51` | FTIR | WP2 | CMS_19a_NC |
| `52` | DLS | WP2 | CMS_4a_AuNP |
| `53` | DLS | WP2 | CMS_5a_AuNP |
| `54` | DLS | WP2 | CMS_6a_AuNP |
| `55` | DLS | WP2 | CMS_15a_TNR |
| `58` | DLS | WP2 | CMS_24a_PS1 |
| `59` | DLS | WP2 | CMS_16a_TMR |
| `60` | DLS | WP2 | CMS_17a_TNA |
| `61` | FTIR | WP2 | CMS_18a_TNA |
| `99` | HR-STEM | WP2 | CMS_1a_AuNP |
| `100` | HR-STEM | WP2 | CMS_25a_PS2 |
| `101` | HR-STEM | WP2 | CMS_2a_AuNP |
| `102` | HR-STEM | WP2 | CMS_3a_AuNP |
| `103` | HR-STEM | WP2 | CMS_4a_AuNP |
| `104` | HR-STEM | WP2 | CMS_5a_AuNP |
| `105` | HR-STEM | WP2 | CMS_6a_AuNP |
| `106` | HR-STEM | WP2 | CMS_15a_TNR |
| `107` | HR-STEM | WP2 | CMS_16a_TMR |
| `108` | HR-STEM | WP2 | CMS_17a_TNA |
| `109` | UV-VIS | WP2 | CMS_1a_AuNP |
| `110` | UV-VIS | WP2 | CMS_2a_AuNP |
| `111` | ZETA | WP2 | CMS_1a_AuNP |
| `121` | SIMS | WP2 | CMS_1a_AuNP |
| `122` | SIMS | WP2 | CMS_2a_AuNP |
| `123` | SIMS | WP2 | CMS_3a_AuNP |
| `124` | SIMS | WP2 | CMS_4a_AuNP |
| `125` | SIMS | WP2 | CMS_5a_AuNP |
| `126` | SIMS | WP2 | CMS_6a_AuNP |
| `127` | SIMS | WP2 | CMS_15a_TNR |
| `128` | SIMS | WP2 | CMS_16a_TMR |
| `129` | SIMS | WP2 | CMS_17a_TNA |
| `130` | SIMS | WP2 | CMS_18a_TNA |
| `145` | XPS | WP4 | CMS_1a_AuNP |
| `146` | UPS | WP4 | CMS_1a_AuNP |
| `151` | XRD | WP2 | CMS_15a_TNR |
| `153` | UV-VIS | WP2 | CMS_3a_AuNP |
| `154` | ZETA | WP2 | CMS_4a_AuNP |
| `155` | UV-VIS | WP2 | CMS_4a_AuNP |
| `156` | ZETA | WP2 | CMS_5a_AuNP |
| `157` | UV-VIS | WP2 | CMS_5a_AuNP |
| `158` | UV-VIS | WP2 | CMS_6a_AuNP |
| `159` | ZETA | WP2 | CMS_6a_AuNP |
| `160` | UV-VIS | WP2 | CMS_15a_TNR |
| `161` | XRD | WP2 | CMS_16a_TMR |
| `162` | UV-VIS | WP2 | CMS_16a_TMR |
| `163` | UV-VIS | WP2 | CMS_17a_TNA |
| `164` | XRD | WP2 | CMS_17a_TNA |
| `165` | UV-VIS | WP2 | CMS_18a_TNA |
| `166` | XRD | WP2 | CMS_18a_TNA |
| `167` | UV-VIS | WP2 | CMS_19a_NC |
| `168` | XRD | WP2 | CMS_19a_NC |
| `169` | UV-VIS | WP2 | CMS_20a_MC |
| `170` | XRD | WP2 | CMS_20a_MC |
| `171` | UV-VIS | WP2 | CMS_24a_PS1 |
| `172` | UV-VIS | WP2 | CMS_25a_PS2 |
| `173` | UV-VIS | WP2 | CMS_26a_CH_CIT |
| `174` | UV-VIS | WP2 | CMS_27a_CH_PEG |
| `177` | UV-VIS | WP2 | CMS_28a_CH_PVP |
| `180` | UV-VIS | WP2 | CMS_29a_CH_TOR |
| `183` | UV-VIS | WP2 | CMS_30a_CH_TER |
| `186` | SIMS | WP2 | CMS_19a_NC |
| `187` | ZETA | WP2 | CMS_3a_AuNP |
| `188` | ZETA | WP2 | CMS_15a_TNR |
| `189` | ZETA | WP2 | CMS_16a_TMR |
| `190` | ZETA | WP2 | CMS_17a_TNA |
| `191` | ZETA | WP2 | CMS_18a_TNA |
| `192` | ZETA | WP2 | CMS_19a_NC |
| `193` | ZETA | WP2 | CMS_20a_MC |
| `195` | ZETA | WP2 | CMS_25a_PS2 |
| `196` | ZETA | WP2 | CMS_7b_AgNP |
| `197` | ZETA | WP2 | CMS_8b_AgNP |
| `198` | FTIR | WP2 | CMS_7b_AgNP |
| `199` | HR-STEM | WP2 | CMS_7b_AgNP |
| `200` | SIMS | WP2 | CMS_7b_AgNP |
| `201` | UV-VIS | WP2 | CMS_7b_AgNP |
| `202` | DLS | WP2 | CMS_8b_AgNP |
| `203` | FTIR | WP2 | CMS_8b_AgNP |
| `204` | HR-STEM | WP2 | CMS_8b_AgNP |
| `205` | SIMS | WP2 | CMS_8b_AgNP |
| `206` | UV-VIS | WP2 | CMS_8b_AgNP |
| `207` | DLS | WP2 | CMS_9b_AgNP |
| `208` | FTIR | WP2 | CMS_9b_AgNP |
| `209` | HR-STEM | WP2 | CMS_9b_AgNP |
| `210` | UV-VIS | WP2 | CMS_9b_AgNP |
| `211` | ZETA | WP2 | CMS_9b_AgNP |
| `212` | SIMS | WP2 | CMS_9b_AgNP |
| `213` | DLS | WP2 | CMS_10b_AgNP |
| `214` | FTIR | WP2 | CMS_10b_AgNP |
| `215` | HR-STEM | WP2 | CMS_10b_AgNP |
| `216` | UV-VIS | WP2 | CMS_10b_AgNP |
| `217` | ZETA | WP2 | CMS_10b_AgNP |
| `218` | SIMS | WP2 | CMS_10b_AgNP |
| `219` | FTIR | WP2 | CMS_11b_AgNP |
| `220` | DLS | WP2 | CMS_11b_AgNP |
| `221` | HR-STEM | WP2 | CMS_11b_AgNP |
| `222` | UV-VIS | WP2 | CMS_11b_AgNP |
| `223` | ZETA | WP2 | CMS_11b_AgNP |
| `224` | SIMS | WP2 | CMS_11b_AgNP |
| `225` | DLS | WP2 | CMS_12b_AgNP |
| `226` | FTIR | WP2 | CMS_12b_AgNP |
| `227` | HR-STEM | WP2 | CMS_12b_AgNP |
| `228` | UV-VIS | WP2 | CMS_12b_AgNP |
| `229` | ZETA | WP2 | CMS_12b_AgNP |
| `230` | SIMS | WP2 | CMS_12b_AgNP |
| `241` | TB | WP3 | CMS_1a_AuNP |
| `242` | DLS | WP2 | CMS_7b_AgNP |
| `243` | TGA | WP2 | CMS_26a_CH_CIT |
| `244` | TGA | WP2 | CMS_27a_CH_PEG |
| `245` | TGA | WP2 | CMS_28a_CH_PVP |
| `246` | TGA | WP2 | CMS_29a_CH_TOR |
| `247` | TGA | WP2 | CMS_30a_CH_TER |
| `248` | DSC | WP2 | CMS_27a_CH_PEG |
| `249` | DSC | WP2 | CMS_28a_CH_PVP |
| `250` | DSC | WP2 | CMS_29a_CH_TOR |
| `251` | DSC | WP2 | CMS_30a_CH_TER |
| `252` | DSC | WP2 | CMS_26a_CH_CIT |
| `254` | FTIR | WP2 | CMS_27a_CH_PEG |
| `255` | FTIR | WP2 | CMS_28a_CH_PVP |
| `256` | FTIR | WP2 | CMS_26a_CH_CIT |
| `257` | ZETA | WP2 | CMS_2a_AuNP |
| `268` | ROS | WP3 | CMS_1a_AuNP |
| `269` | ROS | WP3 | CMS_2a_AuNP |
| `270` | ROS | WP3 | CMS_3a_AuNP |
| `271` | ROS | WP3 | CMS_4a_AuNP |
| `272` | ROS | WP3 | CMS_5a_AuNP |
| `273` | ROS | WP3 | CMS_6a_AuNP |
| `274` | ROS | WP3 | CMS_7b_AgNP |
| `275` | ROS | WP3 | CMS_8b_AgNP |
| `277` | ROS | WP3 | CMS_12b_AgNP |
| `278` | ROS | WP3 | CMS_15a_TNR |
| `279` | ROS | WP3 | CMS_16a_TMR |
| `280` | ROS | WP3 | CMS_17a_TNA |
| `281` | ROS | WP3 | CMS_18a_TNA |
| `282` | ROS | WP3 | CMS_24a_PS1 |
| `284` | ROS | WP3 | CMS_25a_PS2 |
| `285` | ROS | WP3 | CMS_26a_CH_CIT |
| `286` | ROS | WP3 | CMS_27a_CH_PEG |
| `287` | ROS | WP3 | CMS_28a_CH_PVP |
| `288` | ROS | WP3 | CMS_29a_CH_TOR |
| `289` | ROS | WP3 | CMS_30a_CH_TER |
| `290` | ROS | WP3 | CMS_11b_AgNP |
| `294` | TB | WP3 | CMS_2a_AuNP |
| `295` | TB | WP3 | CMS_3a_AuNP |
| `297` | TB | WP3 | CMS_5a_AuNP |
| `298` | TB | WP3 | CMS_6a_AuNP |
| `299` | TB | WP3 | CMS_8b_AgNP |
| `300` | TB | WP3 | CMS_9b_AgNP |
| `301` | TB | WP3 | CMS_10b_AgNP |
| `302` | TB | WP3 | CMS_26a_CH_CIT |
| `303` | TB | WP3 | CMS_27a_CH_PEG |
| `306` | TB | WP3 | CMS_30a_CH_TER |
| `307` | TB | WP3 | CMS_4a_AuNP |
| `308` | DLS | WP2 | CMS_18a_TNA |
| `309` | HR-STEM | WP2 | CMS_18a_TNA |
| `310` | DLS | WP2 | CMS_19a_NC |
| `311` | FTIR | WP2 | CMS_20a_MC |
| `312` | SIMS | WP2 | CMS_20a_MC |
| `313` | FTIR | WP2 | CMS_21a_DG4 |
| `314` | FTIR | WP2 | CMS_22a_DG5 |
| `315` | FTIR | WP2 | CMS_23a_DG6 |
| `316` | FTIR | WP2 | CMS_24a_PS1 |
| `317` | FTIR | WP2 | CMS_25a_PS2 |
| `318` | ZETA | WP2 | CMS_24a_PS1 |
| `319` | HR-STEM | WP2 | CMS_24a_PS1 |
| `320` | DLS | WP2 | CMS_25a_PS2 |
| `321` | UPS | WP4 | CMS_2a_AuNP |
| `328` | UPS | WP4 | CMS_3a_AuNP |
| `329` | UPS | WP4 | CMS_4a_AuNP |
| `330` | UPS | WP4 | CMS_5a_AuNP |
| `331` | UPS | WP4 | CMS_6a_AuNP |
| `332` | UPS | WP4 | CMS_26a_CH_CIT |
| `333` | UPS | WP4 | CMS_27a_CH_PEG |
| `334` | XPS | WP4 | CMS_2a_AuNP |
| `335` | XPS | WP4 | CMS_3a_AuNP |
| `336` | XPS | WP4 | CMS_4a_AuNP |
| `337` | XPS | WP4 | CMS_6a_AuNP |
| `338` | XPS | WP4 | CMS_5a_AuNP |
| `339` | XPS | WP4 | CMS_26a_CH_CIT |
| `340` | XPS | WP4 | CMS_27a_CH_PEG |
| `341` | MNT | WP3 | CMS_26b_CH_CIT |
| `342` | MNT | WP3 | CMS_27d_CH_PEG |
| `343` | ROS | WP3 | CMS_19a_NC |
| `345` | ROS | WP3 | CMS_20a_MC |
| `346` | FTIR | WP2 | CMS_29a_CH_TOR |
| `347` | FTIR | WP2 | CMS_30a_CH_TER |
| `348` | SIMS | WP2 | CMS_21a_DG4 |
| `349` | SIMS | WP2 | CMS_22a_DG5 |
| `360` | MTT | WP3 | CMS_8b_AgNP |
| `362` | MTT | WP3 | CMS_7b_AgNP |
| `363` | MTT | WP3 | CMS_9b_AgNP |
| `365` | TB-Microfludic | WP3 | CMS_1a_AuNP |
| `366` | Rotifier | WP3 | CMS_1a_AuNP |
| `367` | Rotifier | WP3 | CMS_2a_AuNP |
| `368` | Rotifier | WP3 | CMS_3a_AuNP |
| `370` | Rotifier | WP3 | CMS_7b_AgNP |
| `371` | TB-Microfludic | WP3 | CMS_2a_AuNP |
| `372` | TB-Microfludic | WP3 | CMS_3a_AuNP |
| `373` | TB-Microfludic | WP3 | CMS_4a_AuNP |
| `374` | TB-Microfludic | WP3 | CMS_5a_AuNP |
| `375` | TB-Microfludic | WP3 | CMS_6a_AuNP |
| `376` | TB-Microfludic | WP3 | CMS_7b_AgNP |
| `377` | TB-Microfludic | WP3 | CMS_8b_AgNP |
| `378` | TB-Microfludic | WP3 | CMS_9b_AgNP |
| `379` | TB-Microfludic | WP3 | CMS_10b_AgNP |
| `380` | TB-Microfludic | WP3 | CMS_11b_AgNP |
| `381` | TB-Microfludic | WP3 | CMS_12b_AgNP |
| `382` | TB-Microfludic | WP3 | CMS_25a_PS2 |
| `383` | TB-Microfludic | WP3 | CMS_26a_CH_CIT |
| `384` | TB-Microfludic | WP3 | CMS_27a_CH_PEG |
| `385` | TB-Microfludic | WP3 | CMS_28a_CH_PVP |
| `386` | TB-Microfludic | WP3 | CMS_29a_CH_TOR |
| `387` | TB-Microfludic | WP3 | CMS_30a_CH_TER |
| `388` | TB | WP3 | CMS_7b_AgNP |
| `389` | Rotifier | WP3 | CMS_4a_AuNP |
| `390` | Rotifier | WP3 | CMS_5a_AuNP |
| `391` | Rotifier | WP3 | CMS_6a_AuNP |
| `392` | Rotifier | WP3 | CMS_8b_AgNP |
| `393` | Rotifier | WP3 | CMS_9b_AgNP |
| `394` | Rotifier | WP3 | CMS_10b_AgNP |
| `395` | Rotifier | WP3 | CMS_11b_AgNP |
| `396` | Rotifier | WP3 | CMS_12b_AgNP |
| `397` | Rotifier | WP3 | CMS_15a_TNR |
| `398` | Rotifier | WP3 | CMS_16a_TMR |
| `399` | Rotifier | WP3 | CMS_17a_TNA |
| `400` | Rotifier | WP3 | CMS_18a_TNA |
| `401` | Rotifier | WP3 | CMS_19a_NC |
| `402` | Rotifier | WP3 | CMS_20a_MC |
| `403` | Rotifier | WP3 | CMS_25a_PS2 |
| `404` | Rotifier | WP3 | CMS_26a_CH_CIT |
| `405` | Rotifier | WP3 | CMS_27a_CH_PEG |
| `406` | Rotifier | WP3 | CMS_28a_CH_PVP |
| `407` | Rotifier | WP3 | CMS_29a_CH_TOR |
| `408` | Rotifier | WP3 | CMS_30a_CH_TER |
| `409` | TB | WP3 | CMS_29a_CH_TOR |
| `411` | MTT | WP3 | CMS_21a_DG4 |
| `412` | MTT | WP3 | CMS_22a_DG5 |
| `413` | MTT | WP3 | CMS_23a_DG6 |
| `414` | SIMS | WP2 | CMS_23a_DG6 |
| `415` | SIMS | WP2 | CMS_24a_PS1 |
| `416` | SIMS | WP2 | CMS_25a_PS2 |
| `417` | DSC | WP2 | CMS_21a_DG4 |
| `419` | DSC | WP2 | CMS_22a_DG5 |
| `420` | DSC | WP2 | CMS_23a_DG6 |
| `421` | TGA | WP2 | CMS_21a_DG4 |
| `422` | TGA | WP2 | CMS_22a_DG5 |
| `423` | TGA | WP2 | CMS_23a_DG6 |
| `424` | ROS | WP3 | CMS_9b_AgNP |
| `426` | MTT | WP3 | CMS_10b_AgNP |
| `427` | ROS | WP3 | CMS_10b_AgNP |
| `428` | MTT | WP3 | CMS_11b_AgNP |
| `430` | MTT | WP3 | CMS_12b_AgNP |
| `432` | WaterFlea | WP3 | CMS_1a_AuNP |
| `433` | WaterFlea | WP3 | CMS_2a_AuNP |
| `434` | WaterFlea | WP3 | CMS_3a_AuNP |
| `435` | WaterFlea | WP3 | CMS_4a_AuNP |
| `436` | WaterFlea | WP3 | CMS_5a_AuNP |
| `437` | WaterFlea | WP3 | CMS_6a_AuNP |
| `438` | WaterFlea | WP3 | CMS_7b_AgNP |
| `439` | WaterFlea | WP3 | CMS_8b_AgNP |
| `440` | WaterFlea | WP3 | CMS_9b_AgNP |
| `441` | WaterFlea | WP3 | CMS_10b_AgNP |
| `442` | WaterFlea | WP3 | CMS_11b_AgNP |
| `443` | WaterFlea | WP3 | CMS_12b_AgNP |
| `444` | WaterFlea | WP3 | CMS_15a_TNR |
| `445` | WaterFlea | WP3 | CMS_16a_TMR |
| `446` | WaterFlea | WP3 | CMS_17a_TNA |
| `447` | WaterFlea | WP3 | CMS_18a_TNA |
| `448` | WaterFlea | WP3 | CMS_19a_NC |
| `449` | WaterFlea | WP3 | CMS_20a_MC |
| `450` | WaterFlea | WP3 | CMS_21a_DG4 |
| `451` | WaterFlea | WP3 | CMS_22a_DG5 |
| `452` | WaterFlea | WP3 | CMS_23a_DG6 |
| `453` | WaterFlea | WP3 | CMS_24a_PS1 |
| `454` | WaterFlea | WP3 | CMS_25a_PS2 |
| `455` | WaterFlea | WP3 | CMS_26a_CH_CIT |
| `456` | WaterFlea | WP3 | CMS_27a_CH_PEG |
| `457` | WaterFlea | WP3 | CMS_28a_CH_PVP |
| `458` | WaterFlea | WP3 | CMS_29a_CH_TOR |
| `459` | WaterFlea | WP3 | CMS_30a_CH_TER |
| `460` | Algae | WP3 | CMS_1a_AuNP |
| `461` | Algae | WP3 | CMS_2a_AuNP |
| `462` | Algae | WP3 | CMS_3a_AuNP |
| `463` | Algae | WP3 | CMS_4a_AuNP |
| `464` | Algae | WP3 | CMS_5a_AuNP |
| `465` | Algae | WP3 | CMS_6a_AuNP |
| `466` | Algae | WP3 | CMS_7b_AgNP |
| `467` | Algae | WP3 | CMS_8b_AgNP |
| `468` | Algae | WP3 | CMS_9b_AgNP |
| `469` | Algae | WP3 | CMS_10b_AgNP |
| `470` | Algae | WP3 | CMS_11b_AgNP |
| `471` | Algae | WP3 | CMS_12b_AgNP |
| `472` | Algae | WP3 | CMS_19a_NC |
| `473` | Algae | WP3 | CMS_20a_MC |
| `474` | Algae | WP3 | CMS_21a_DG4 |
| `475` | Algae | WP3 | CMS_22a_DG5 |
| `476` | Algae | WP3 | CMS_23a_DG6 |
| `477` | Algae | WP3 | CMS_24a_PS1 |
| `478` | Algae | WP3 | CMS_25a_PS2 |
| `479` | Algae | WP3 | CMS_26a_CH_CIT |
| `480` | Algae | WP3 | CMS_27a_CH_PEG |
| `481` | Algae | WP3 | CMS_28a_CH_PVP |
| `482` | Algae | WP3 | CMS_29a_CH_TOR |
| `483` | Algae | WP3 | CMS_30a_CH_TER |
