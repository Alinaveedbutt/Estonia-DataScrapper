# Estonia Company Data Pipeline

Zero-cost pipeline that finds **newly registered Estonian companies** from the official **e-Business Register open data**, classifies whether they have a website, pulls **official free phone/email** from the register, prioritises **NO WEBSITE** leads, and syncs rows to **Google Sheets** for manual cold call / email outreach.

It does **not** send emails, make calls, or contact companies. You do outreach yourself.

---

## Why Estonia

Unlike the UK Companies House path (identity works; free contact enrichment fails), Estonia’s daily **General data** dump includes **Contacts** (`sidevahendid`) with high measured fill (~96% email / ~65% phone on active companies). Licence: open data with attribution (CC BY–style reuse via RIK terms).

Official source: [Downloading open data — e-Business Register](https://avaandmed.ariregister.rik.ee/en/downloading-open-data)

---

## Sales workflow

```
e-Business Register General data (JSON zip, free, daily)
        ↓
Filter by first-entry / registration date (new companies)
        ↓
Store identity: name, registry code, status, legal form, address, date
        ↓
Website detection:
  1) Official WWW from register contacts
  2) Domain probe (.ee / .com / .eu)
        ↓
Website status: WEBSITE_EXISTS or NO_WEBSITE
        ↓
Official phone + email from register only (never invented)
        ↓
Prioritise NO_WEBSITE → Google Sheets (Apps Script webhook)
        ↓
You manually call / email and offer websites / apps
```

**Primary targets:** `NO_WEBSITE` rows with phone and/or email.

---

## Strict $0 constraints

- No paid APIs, enrichment vendors, proxies, or CAPTCHA services
- No Postgres / Neon / Prisma — process in memory from the open-data file, optional local checkpoint file, push to Sheets
- Contacts only from official register fields — if missing, store null + reason

---

## How to run locally

```bash
npm install
cp .env.example .env
# Set GOOGLE_SHEETS_WEBHOOK_URL + GOOGLE_SHEETS_WEBHOOK_SECRET (optional for dry run)

npm test
npm run health
npm run scan -- --skip-sheets --max 20
```

Useful flags:

| Flag | Meaning |
|------|---------|
| `--from YYYY-MM-DD` | Start of registration window |
| `--to YYYY-MM-DD` | End of registration window |
| `--max N` | Cap companies after date filter |
| `--skip-sheets` | Do not call Apps Script |
| `--skip-website-probe` | Only trust register WWW |

First run downloads the **General data** zip (~200MB compressed; ~4GB JSON streamed, not fully loaded into RAM) into `./data/`. Subsequent runs reuse / refresh that file. A small `data/pipeline-state.json` checkpoint tracks the last successful scan date.

Dev shortcut — point at an already-downloaded zip:

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

Registry Code, Company Name, Registration Date, Status, Status Text, Legal Form, Address Line, Locality, Postal Code, Country, Full Address, Website Status, Website URL, Website Source, Phone, Email, Contact Source, Contact Status, Phone Missing Reason, Email Missing Reason, First Seen, Last Checked, Data Source

Rows are upserted by **Registry Code**. Sync order puts **NO_WEBSITE** first. Set `SHEETS_NO_WEBSITE_ONLY=true` to sync only those rows.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run scan` | Full pipeline |
| `npm run health` | Open-data URL + Sheets webhook check |
| `npm test` | Unit tests (parsers/mappers/checkpoint) |
| `npm run build` | Compile TypeScript |

---

## GitHub Actions

Workflow **Estonia Company Pipeline** (`.github/workflows/company-pipeline.yml`) runs daily at 02:00 UTC and on `workflow_dispatch`.

Secrets needed:

- `GOOGLE_SHEETS_WEBHOOK_URL`
- `GOOGLE_SHEETS_WEBHOOK_SECRET`

No `DATABASE_URL` or Companies House key.

---

## Attribution / legal

Data © Registrite ja Infosüsteemide Keskus (RIK) — reuse under their [open-data terms](https://avaandmed.ariregister.rik.ee/en/downloading-open-data). If you process personal data (e.g. sole-trader contact details), GDPR still applies; keep your own lawful basis for outreach and honour unsubscribe requests.

---

## What changed from the UK version

- Companies House API → Estonia General data open dump
- Postgres/Neon/Prisma **removed** (not required; Sheets is the store)
- UK directory scrapers / Yolist / FSA / council rates **removed**
- Contacts come from official `sidevahendid` (EMAIL, TEL/MOB, WWW)
- Branding/package renamed to Estonia (GitHub remote name unchanged)
