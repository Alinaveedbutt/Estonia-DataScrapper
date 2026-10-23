# Estonia Company Data Pipeline

Zero-cost pipeline for **cold-call / email outreach**: finds **newly registered Estonian companies** from official **e-Business Register open data**, classifies website presence, pulls **official free phone and email** from the register, prioritises **NO WEBSITE + phone** leads, and syncs to **Google Sheets**.

It does **not** send emails, make calls, or contact companies. You do outreach yourself.

**Cold-call focus:** Phone is first-class (MOB preferred, then TEL). Default Sheets sync only includes rows with an official register phone (`SHEETS_REQUIRE_PHONE=true`). Email is kept alongside when published.

---

## Source

Daily **General data** dump from the [e-Business Register open data portal](https://avaandmed.ariregister.rik.ee/en/downloading-open-data) — includes identity fields plus **Contacts** (`sidevahendid`: EMAIL, TEL/MOB, WWW).

---

## Sales workflow

```
e-Business Register General data (JSON zip, free, daily)
        ↓
Filter by first-entry / registration date (new companies)
        ↓
Identity: name, registry code, status, legal form, address, date
        ↓
Website detection:
  1) Official WWW from register contacts
  2) Domain probe (.ee / .com / .eu)
        ↓
Official phone (MOB/TEL) + email from register only — never invented
        ↓
Sort: NO_WEBSITE → has phone → has contact → newest
        ↓
Google Sheets (default: rows with phone) → you cold-call / email
```

**Primary targets:** `NO_WEBSITE` + official **phone** (offer websites / apps).

---

## Strict $0 constraints

- No paid APIs, enrichment vendors, proxies, or CAPTCHA services
- No database — open-data file → memory → Sheets (+ small local checkpoint file)
- Contacts only from official register fields — if missing, store null + reason

---

## How to run locally

```bash
npm install
cp .env.example .env
# Set GOOGLE_SHEETS_WEBHOOK_URL + GOOGLE_SHEETS_WEBHOOK_SECRET

npm test
npm run health
npm run scan -- --skip-sheets --max 20
npm run scan
```

Useful flags:

| Flag | Meaning |
|------|---------|
| `--from YYYY-MM-DD` | Start of registration window |
| `--to YYYY-MM-DD` | End of registration window |
| `--max N` | Cap **after** phone/NO_WEBSITE prioritisation (keeps callable leads) |
| `--skip-sheets` | Do not call Apps Script |
| `--skip-website-probe` | Only trust register WWW |

First run downloads the **General data** zip (~200MB compressed; ~4GB JSON streamed, not fully loaded into RAM) into `./data/`. Cache reused for ~20h. Checkpoint: `data/pipeline-state.json`.

```bash
ESTONIA_LOCAL_DUMP_PATH=/path/to/ettevotja_rekvisiidid__yldandmed.json.zip \
  npm run scan -- --from 2026-10-14 --to 2026-10-22 --max 50 --skip-sheets
```

---

## Google Sheets setup

1. Create a Sheet
2. Extensions → Apps Script → paste `google-apps-script/Code.gs`
3. Project Settings → Script Properties → `WEBHOOK_SECRET` = strong random string
4. Deploy → Web app → Execute as Me → Anyone
5. Put the URL and secret in `.env` (or GitHub Actions secrets)

### Sheet columns

Registry Code, Company Name, Registration Date, Status, Status Text, Legal Form, Address Line, Locality, Postal Code, Country, Full Address, Website Status, Website URL, Website Source, **Phone**, **Phone Type**, Email, Contact Source, Contact Status, Phone Missing Reason, Email Missing Reason, First Seen, Last Checked, Data Source

Rows upsert by **Registry Code**.

### Sync filters (env)

| Variable | Default | Effect |
|----------|---------|--------|
| `SHEETS_REQUIRE_PHONE` | `true` | Only sync rows with official phone (cold-call) |
| `SHEETS_REQUIRE_CONTACT` | `false` | If phone filter off: require phone or email |
| `SHEETS_NO_WEBSITE_ONLY` | `false` | Sync only `NO_WEBSITE` rows |

Set `SHEETS_REQUIRE_PHONE=false` if you also want email-only leads in the sheet.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run scan` | Full pipeline |
| `npm run health` | Open-data URL + Sheets webhook check |
| `npm test` | Unit tests |
| `npm run build` | Compile TypeScript |

---

## GitHub Actions

- **CI** (`.github/workflows/ci.yml`) — `npm test` + `npm run build` on PRs/pushes
- **Estonia Company Pipeline** (`.github/workflows/company-pipeline.yml`) — daily 02:00 UTC + manual

Secrets for the daily job:

- `GOOGLE_SHEETS_WEBHOOK_URL`
- `GOOGLE_SHEETS_WEBHOOK_SECRET`

---

## Attribution / legal

Data © Registrite ja Infosüsteemide Keskus (RIK) — reuse under their [open-data terms](https://avaandmed.ariregister.rik.ee/en/downloading-open-data). GDPR still applies to personal data in contacts; keep your own lawful basis for outreach.
