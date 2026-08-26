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

Open Terminal and enter these commands. Replace the example values with your
own credential:

```bash
export CHEMAT_CLIENT_ID='cms_your_client_id_here'
export CHEMAT_CLIENT_SECRET='your_client_secret_here'
```

The single quotation marks are important. They prevent the shell from treating
characters in the secret as commands.

Check your credential:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/portal/me'
```

Then request the first 25 tests:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/tests?limit=25&offset=0'
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

Request the first 25 tests:

```powershell
curl.exe --fail-with-body --user "$($env:CHEMAT_CLIENT_ID):$($env:CHEMAT_CLIENT_SECRET)" `
  "https://database.eurskem.com/api/v1/tests?limit=25&offset=0"
```

When finished:

```powershell
Remove-Item Env:CHEMAT_CLIENT_ID
Remove-Item Env:CHEMAT_CLIENT_SECRET
```

## 4. Available methods

All ProtoQSAR requests use the HTTP method `GET`. `GET` means “read”; these
requests do not create, update, or delete test records.

| Method and endpoint | Purpose |
|---|---|
| `GET /portal/me` | Check that the credential works |
| `GET /tests?limit=25&offset=0` | Read one page of test summaries |
| `GET /experimental-data/{test_id}` | Read detailed data for one test |

Replace `{test_id}` with the numeric `id` returned by `/tests`. For example:

```bash
curl --fail-with-body --user "$CHEMAT_CLIENT_ID:$CHEMAT_CLIENT_SECRET" \
  'https://database.eurskem.com/api/v1/experimental-data/3'
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

## 7. Python: download all tests

Install Python 3, then install the `requests` package once:

```bash
python3 -m pip install requests
```

Create a file named `download_tests.py` with this complete program:

```python
import json
import os

import requests

BASE_URL = "https://database.eurskem.com/api/v1"
CLIENT_ID = os.environ["CHEMAT_CLIENT_ID"]
CLIENT_SECRET = os.environ["CHEMAT_CLIENT_SECRET"]

all_tests = []
offset = 0

while True:
    response = requests.get(
        f"{BASE_URL}/tests",
        params={"limit": 25, "offset": offset},
        auth=(CLIENT_ID, CLIENT_SECRET),
        timeout=30,
    )
    response.raise_for_status()
    page = response.json()
    all_tests.extend(page)

    if len(page) < 25:
        break
    offset += 25

with open("chematsustain_tests.json", "w", encoding="utf-8") as output:
    json.dump(all_tests, output, indent=2, ensure_ascii=False)

print(f"Saved {len(all_tests)} tests to chematsustain_tests.json")
```

Set the environment variables as shown in section 3, then run:

```bash
python3 download_tests.py
```

The program creates `chematsustain_tests.json` in the current directory. It
does not write your secret into that output file.

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

After downloading `chematsustain_tests.json`, this program creates a spreadsheet-
friendly CSV file:

```python
import csv
import json

with open("chematsustain_tests.json", encoding="utf-8") as source:
    tests = json.load(source)

columns = [
    "id",
    "work_package_name",
    "element_cms_id",
    "test_name",
    "test_details",
    "final_results",
    "statistical_analysis",
    "created_at",
    "updated_at",
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