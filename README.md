# Estonia Company Data Pipeline

Zero-cost pipeline for **cold-call / email outreach**: finds **newly registered Estonian companies** from official **e-Business Register open data**, classifies website presence, pulls **official free phone and email** from the register, prioritises **NO WEBSITE + phone** leads, and syncs to **Google Sheets**.

It does **not** send emails, make calls, or contact companies. You do outreach yourself.

**Cold-call focus:** Website check is automatic. **Google Sheets only receives `NO_WEBSITE` companies** (`SHEETS_NO_WEBSITE_ONLY=true`) that also have an official register phone by default (`SHEETS_REQUIRE_PHONE=true`). Email is kept alongside when published. The scraper never contacts anyone — you cold-call / email from the sheet.

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
Automatic website check:
  1) Official WWW from register contacts
  2) Domain probe (.ee / .com / .eu)
  → WEBSITE_EXISTS (skipped for Sheets) or NO_WEBSITE (lead)
        ↓
Official phone (MOB/TEL) + email from register only — never invented
        ↓
Google Sheets ← ONLY NO_WEBSITE (+ phone by default)
        ↓
You manually cold-call / email from the sheet (scraper never contacts anyone)
```

**Sheet contents (defaults):** `NO_WEBSITE` + official **phone** — offer websites / apps.

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

### Sheet columns (Companies)

Exactly seven columns:

| Column | Content |
|--------|---------|
| Daily pipeline Run Date | Date/time of this pipeline run (`DD/MM/YYYY HH:mm UTC`) |
| Registry Code | Estonian registry code |
| Company's Name | Legal name |
| Registry Date | First registration date as **DD/MM/YYYY** (date/month/year) |
| Website Status | **Yes** or **No** |
| Email | Official register email (if any) |
| Phone Number | Official register phone (MOB preferred, else TEL) |

Rows upsert by **Registry Code**. Defaults only *send* NO_WEBSITE + phone rows, so Website Status on the sheet is normally **No**.

### Rolling 7-day retention

After each sync, Apps Script **deletes** Companies rows where **Registry Date** or **Daily pipeline Run Date** is more than **7 days** before today. Aligns with `ESTONIA_LOOKBACK_DAYS=7` — a rolling week of cold-call leads.

### Sync filters (env)

| Variable | Default | Effect |
|----------|---------|--------|
| `SHEETS_NO_WEBSITE_ONLY` | `true` | Only sync `NO_WEBSITE` rows |
| `SHEETS_REQUIRE_PHONE` | `true` | Only sync rows with official phone |
| `SHEETS_REQUIRE_CONTACT` | `false` | If phone filter off: require phone or email |
| `ESTONIA_LOOKBACK_DAYS` | `7` | Discovery window; matches sheet retention |

**After updating `Code.gs`:** Deploy → Manage deployments → Edit → **New version** → Deploy, then run the workflow once (Actions → Estonia Company Pipeline → Run workflow).

Phone numbers are written as **plain text** (so `+372…` does not become `#ERROR!`). If you still see old wide headers (e.g. a lone **Phone** column), you have not redeployed the 7-column script yet — redeploy, then re-run.

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
- **Estonia Company Pipeline** (`.github/workflows/company-pipeline.yml`) — **daily at 12:00 noon Asia/Karachi (UTC+5)** = cron `0 7 * * *` (07:00 UTC), plus manual `workflow_dispatch`

**Required for the daily Sheets sync** (schedule still runs without them, but sync fails):

- Repo secret `GOOGLE_SHEETS_WEBHOOK_URL`
- Repo secret `GOOGLE_SHEETS_WEBHOOK_SECRET`

Also ensure **Actions are enabled** for the repository (Settings → Actions).

---

## Attribution / legal

Data © Registrite ja Infosüsteemide Keskus (RIK) — reuse under their [open-data terms](https://avaandmed.ariregister.rik.ee/en/downloading-open-data). GDPR still applies to personal data in contacts; keep your own lawful basis for outreach.
