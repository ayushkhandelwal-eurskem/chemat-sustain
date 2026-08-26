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

The appendix below contains every available `test_id` and its associated
`test_name`. The same name can appear more than once, so always use the numeric
ID from the row you want.

For example, the first row is:

| Test ID | Test name |
|---:|---|
| `3` | MTT |

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

## 14. Complete test ID and test-name list

This list was exported from the production CheMatSustain database. It contains
all 327 tests available when this guide was generated. It is a dated reference,
not the live source. Use `/api/v1/test-index` or the API Explorer to see tests
added later. Test IDs are permanent record identifiers but are not consecutive.
Repeated test names are expected.

| Test ID | Test name |
|---:|---|
| `3` | MTT |
| `4` | MTT |
| `5` | MTT |
| `6` | MTT |
| `7` | MTT |
| `8` | MTT |
| `9` | MTT |
| `10` | MTT |
| `12` | MTT |
| `14` | MTT |
| `16` | MTT |
| `28` | DLS |
| `32` | DLS |
| `36` | DLS |
| `37` | MTT |
| `41` | FTIR |
| `42` | FTIR |
| `43` | FTIR |
| `44` | FTIR |
| `45` | FTIR |
| `46` | FTIR |
| `47` | FTIR |
| `48` | FTIR |
| `49` | FTIR |
| `51` | FTIR |
| `52` | DLS |
| `53` | DLS |
| `54` | DLS |
| `55` | DLS |
| `58` | DLS |
| `59` | DLS |
| `60` | DLS |
| `61` | FTIR |
| `99` | HR-STEM |
| `100` | HR-STEM |
| `101` | HR-STEM |
| `102` | HR-STEM |
| `103` | HR-STEM |
| `104` | HR-STEM |
| `105` | HR-STEM |
| `106` | HR-STEM |
| `107` | HR-STEM |
| `108` | HR-STEM |
| `109` | UV-VIS |
| `110` | UV-VIS |
| `111` | ZETA |
| `121` | SIMS |
| `122` | SIMS |
| `123` | SIMS |
| `124` | SIMS |
| `125` | SIMS |
| `126` | SIMS |
| `127` | SIMS |
| `128` | SIMS |
| `129` | SIMS |
| `130` | SIMS |
| `145` | XPS |
| `146` | UPS |
| `151` | XRD |
| `153` | UV-VIS |
| `154` | ZETA |
| `155` | UV-VIS |
| `156` | ZETA |
| `157` | UV-VIS |
| `158` | UV-VIS |
| `159` | ZETA |
| `160` | UV-VIS |
| `161` | XRD |
| `162` | UV-VIS |
| `163` | UV-VIS |
| `164` | XRD |
| `165` | UV-VIS |
| `166` | XRD |
| `167` | UV-VIS |
| `168` | XRD |
| `169` | UV-VIS |
| `170` | XRD |
| `171` | UV-VIS |
| `172` | UV-VIS |
| `173` | UV-VIS |
| `174` | UV-VIS |
| `177` | UV-VIS |
| `180` | UV-VIS |
| `183` | UV-VIS |
| `186` | SIMS |
| `187` | ZETA |
| `188` | ZETA |
| `189` | ZETA |
| `190` | ZETA |
| `191` | ZETA |
| `192` | ZETA |
| `193` | ZETA |
| `195` | ZETA |
| `196` | ZETA |
| `197` | ZETA |
| `198` | FTIR |
| `199` | HR-STEM |
| `200` | SIMS |
| `201` | UV-VIS |
| `202` | DLS |
| `203` | FTIR |
| `204` | HR-STEM |
| `205` | SIMS |
| `206` | UV-VIS |
| `207` | DLS |
| `208` | FTIR |
| `209` | HR-STEM |
| `210` | UV-VIS |
| `211` | ZETA |
| `212` | SIMS |
| `213` | DLS |
| `214` | FTIR |
| `215` | HR-STEM |
| `216` | UV-VIS |
| `217` | ZETA |
| `218` | SIMS |
| `219` | FTIR |
| `220` | DLS |
| `221` | HR-STEM |
| `222` | UV-VIS |
| `223` | ZETA |
| `224` | SIMS |
| `225` | DLS |
| `226` | FTIR |
| `227` | HR-STEM |
| `228` | UV-VIS |
| `229` | ZETA |
| `230` | SIMS |
| `241` | TB |
| `242` | DLS |
| `243` | TGA |
| `244` | TGA |
| `245` | TGA |
| `246` | TGA |
| `247` | TGA |
| `248` | DSC |
| `249` | DSC |
| `250` | DSC |
| `251` | DSC |
| `252` | DSC |
| `254` | FTIR |
| `255` | FTIR |
| `256` | FTIR |
| `257` | ZETA |
| `268` | ROS |
| `269` | ROS |
| `270` | ROS |
| `271` | ROS |
| `272` | ROS |
| `273` | ROS |
| `274` | ROS |
| `275` | ROS |
| `277` | ROS |
| `278` | ROS |
| `279` | ROS |
| `280` | ROS |
| `281` | ROS |
| `282` | ROS |
| `284` | ROS |
| `285` | ROS |
| `286` | ROS |
| `287` | ROS |
| `288` | ROS |
| `289` | ROS |
| `290` | ROS |
| `294` | TB |
| `295` | TB |
| `297` | TB |
| `298` | TB |
| `299` | TB |
| `300` | TB |
| `301` | TB |
| `302` | TB |
| `303` | TB |
| `306` | TB |
| `307` | TB |
| `308` | DLS |
| `309` | HR-STEM |
| `310` | DLS |
| `311` | FTIR |
| `312` | SIMS |
| `313` | FTIR |
| `314` | FTIR |
| `315` | FTIR |
| `316` | FTIR |
| `317` | FTIR |
| `318` | ZETA |
| `319` | HR-STEM |
| `320` | DLS |
| `321` | UPS |
| `328` | UPS |
| `329` | UPS |
| `330` | UPS |
| `331` | UPS |
| `332` | UPS |
| `333` | UPS |
| `334` | XPS |
| `335` | XPS |
| `336` | XPS |
| `337` | XPS |
| `338` | XPS |
| `339` | XPS |
| `340` | XPS |
| `341` | MNT |
| `342` | MNT |
| `343` | ROS |
| `345` | ROS |
| `346` | FTIR |
| `347` | FTIR |
| `348` | SIMS |
| `349` | SIMS |
| `360` | MTT |
| `362` | MTT |
| `363` | MTT |
| `365` | TB-Microfludic |
| `366` | Rotifier |
| `367` | Rotifier |
| `368` | Rotifier |
| `370` | Rotifier |
| `371` | TB-Microfludic |
| `372` | TB-Microfludic |
| `373` | TB-Microfludic |
| `374` | TB-Microfludic |
| `375` | TB-Microfludic |
| `376` | TB-Microfludic |
| `377` | TB-Microfludic |
| `378` | TB-Microfludic |
| `379` | TB-Microfludic |
| `380` | TB-Microfludic |
| `381` | TB-Microfludic |
| `382` | TB-Microfludic |
| `383` | TB-Microfludic |
| `384` | TB-Microfludic |
| `385` | TB-Microfludic |
| `386` | TB-Microfludic |
| `387` | TB-Microfludic |
| `388` | TB |
| `389` | Rotifier |
| `390` | Rotifier |
| `391` | Rotifier |
| `392` | Rotifier |
| `393` | Rotifier |
| `394` | Rotifier |
| `395` | Rotifier |
| `396` | Rotifier |
| `397` | Rotifier |
| `398` | Rotifier |
| `399` | Rotifier |
| `400` | Rotifier |
| `401` | Rotifier |
| `402` | Rotifier |
| `403` | Rotifier |
| `404` | Rotifier |
| `405` | Rotifier |
| `406` | Rotifier |
| `407` | Rotifier |
| `408` | Rotifier |
| `409` | TB |
| `411` | MTT |
| `412` | MTT |
| `413` | MTT |
| `414` | SIMS |
| `415` | SIMS |
| `416` | SIMS |
| `417` | DSC |
| `419` | DSC |
| `420` | DSC |
| `421` | TGA |
| `422` | TGA |
| `423` | TGA |
| `424` | ROS |
| `426` | MTT |
| `427` | ROS |
| `428` | MTT |
| `430` | MTT |
| `432` | WaterFlea |
| `433` | WaterFlea |
| `434` | WaterFlea |
| `435` | WaterFlea |
| `436` | WaterFlea |
| `437` | WaterFlea |
| `438` | WaterFlea |
| `439` | WaterFlea |
| `440` | WaterFlea |
| `441` | WaterFlea |
| `442` | WaterFlea |
| `443` | WaterFlea |
| `444` | WaterFlea |
| `445` | WaterFlea |
| `446` | WaterFlea |
| `447` | WaterFlea |
| `448` | WaterFlea |
| `449` | WaterFlea |
| `450` | WaterFlea |
| `451` | WaterFlea |
| `452` | WaterFlea |
| `453` | WaterFlea |
| `454` | WaterFlea |
| `455` | WaterFlea |
| `456` | WaterFlea |
| `457` | WaterFlea |
| `458` | WaterFlea |
| `459` | WaterFlea |
| `460` | Algae |
| `461` | Algae |
| `462` | Algae |
| `463` | Algae |
| `464` | Algae |
| `465` | Algae |
| `466` | Algae |
| `467` | Algae |
| `468` | Algae |
| `469` | Algae |
| `470` | Algae |
| `471` | Algae |
| `472` | Algae |
| `473` | Algae |
| `474` | Algae |
| `475` | Algae |
| `476` | Algae |
| `477` | Algae |
| `478` | Algae |
| `479` | Algae |
| `480` | Algae |
| `481` | Algae |
| `482` | Algae |
| `483` | Algae |
