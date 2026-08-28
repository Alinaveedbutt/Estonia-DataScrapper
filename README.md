# UK Company Data Pipeline — Full Project Summary

## What this project is

This is a **zero-cost automated pipeline** that discovers **newly incorporated UK companies** from Companies House, stores their official data, determines whether each company has a website, attempts to find **phone numbers and email addresses** from free public sources, saves everything to **PostgreSQL (Neon)**, and syncs results to **Google Sheets** for your manual use.

It is **not** an outreach tool. It never sends emails, makes calls, sends SMS, submits forms, or contacts companies in any way. You do all outreach yourself.

---

## The core goal

Your business goal is:

1. **Find new UK companies** as soon as they are incorporated.
2. **Keep every company** in the dataset — not just leads.
3. **Classify each company** as:
   - **WEBSITE EXISTS**
   - **NO WEBSITE**
4. **Prioritize NO WEBSITE companies** — these are your primary target because you manually offer them website development services.
5. **Enrich NO WEBSITE companies with phone and email** from legitimate free public sources.
6. **Store verified contacts** with source URL, source type, confidence, and last-checked timestamp.
7. **Never fabricate or guess** phone or email data.
8. **Sync to Google Sheets** so you can work from a spreadsheet.

In short: **discover → classify → enrich contacts → store → sheet → you outreach manually**.

---

## Intended workflow

```
Companies House API
    ↓
Newly incorporated companies
    ↓
Official company data (name, address, status, type)
    ↓
Website detection (domain probing + optional search)
    ↓
Website status: WEBSITE EXISTS or NO WEBSITE
    ↓
For NO WEBSITE only → public-source phone/email enrichment
    ↓
PostgreSQL (Neon)
    ↓
Google Sheets (Apps Script webhook)
    ↓
You manually contact companies
```

---

## What the software actually does today

### Working well

| Feature | Status |
|---------|--------|
| **Companies House discovery** | Works — searches by incorporation date, fetches company profiles |
| **Official data storage** | Works — name, address, incorporation date, company type/status |
| **Website detection** | Works — domain probing finds websites reliably (~60% in latest live test) |
| **Website status on every row** | Works — all companies stored with `WEBSITE_EXISTS` or `NO_WEBSITE` |
| **NO WEBSITE identification** | Works — these are flagged as your primary enrichment target |
| **Enrichment pipeline execution** | Works — runs without crashing, respects budgets/timeouts |
| **Contact verification** | Works — same-company matching, no fake data injection |
| **Fail-fast on blocked sources** | Works — 403/429 sources blocked for remainder of run, not retried endlessly |
| **PostgreSQL storage** | Works — Neon free tier |
| **Google Sheets sync** | Implemented — Apps Script webhook (needs sheet script update for new columns) |
| **Unit tests** | 39/39 passing |
| **TypeScript build** | Compiles cleanly |

### Not working (the main problem)

| Feature | Status |
|---------|--------|
| **Phone enrichment from free sources** | **0% real coverage** across all live testing |
| **Email enrichment from free sources** | **0% real coverage** across all live testing |

The pipeline **runs correctly** but **finds no real contacts** for newly incorporated no-website companies under $0 constraints.

---

## Your constraints (non-negotiable)

These shaped every decision:

- **$0 cost** — no paid APIs, directories, proxies, enrichment services, or billing
- **No Google Custom Search (CSE)** — explicitly excluded
- **No Bing Search API**
- **No outreach** — software never contacts companies
- **Laptop is dev-only** — no permanent local workers, scheduled tasks, or production localhost dependencies
- **Production target** — GitHub Actions + Neon + Google Apps Script (not set up yet per your instruction)
- **No fabrication** — if no contact is found, store null with a reason, never invent data

---

## How website detection works

For each company, the pipeline tries to determine if a website exists:

1. **Domain probing** — guesses likely domains from company name (e.g. `acmecorp.co.uk`) and checks if they respond
2. **Optional DuckDuckGo search** — disabled by default (`ENABLE_OPTIONAL_SEARCH=false`) because it is unreliable and times out; not a hard dependency

Results:

- If a website is found → company stored as **WEBSITE EXISTS** with URL and source; contact enrichment skipped (`NOT_APPLICABLE`)
- If no website found → company stored as **NO WEBSITE** → enrichment attempted

In the latest 10-company live test: **6 had websites, 4 did not**.

---

## How contact enrichment works (for NO WEBSITE companies)

For each no-website company, phone and email are searched **independently** through a chain of public-source providers. Each provider is modular behind a common abstraction.

**Provider chain (current order):**

1. **Companies House public page** — scrape the official CH company page
2. **Companies House filings** — check filed documents for contact hints
3. **Yolist** — UK business directory REST API (`yolist.uk/api/v1`)
4. **FSA Food Hygiene Ratings** — official free API for food/catering businesses
5. **Council business rates** — Harlow (CM*) and Leeds (LS*) CSV datasets — **identity/address matching only**, not used for phone/email extraction
6. **OpenCorporates** — stub only, insufficient data
7. **Optional DuckDuckGo search** — only if explicitly enabled

**For each provider:**

- Strict per-company budgets (max page fetches, timeouts)
- Fail-fast on 403/429/blocked responses
- Blocked providers skipped for remainder of run
- Extracted contacts verified against company name/number/address
- Best verified phone and email selected independently
- Source URL, source type, confidence, and last-checked recorded

**Contact status values:**

- `COMPLETE` — phone and email found
- `PARTIAL` — one of phone or email found
- `NOT_YET_PUBLIC` — enrichment ran, no contacts found (expected for new companies)
- `EXTRACTION_FAILURE` — provider errors occurred
- `NOT_APPLICABLE` — company has a website, enrichment skipped

---

## Every approach tried to get phone/email (chronological)

This is the full history of sources investigated and tested:

### Tier 1 — Primary public directories (all failed from your environment)

| Source | What we tried | Result |
|--------|---------------|--------|
| **Endole** | Scrape company insight pages | **403 Forbidden** — blocked |
| **Yell.com** | Business directory scraping | **403 Forbidden** — blocked |
| **192.com** | UK directory | **Unusable** — blocked/inaccessible |
| **Cylex** | Business directory | **403 Forbidden** — blocked |
| **FreeIndex** | Business directory | **403 Forbidden** — blocked |
| **Checkatrade** | Trades directory | **403 Forbidden** — blocked |
| **Hotfrog** | Business directory | **403 Forbidden** — blocked |
| **Thomson Local** | Business directory | **403 Forbidden** — blocked |

These are the sources most likely to have phone/email for UK businesses, but they **actively block automated access** from non-browser environments.

### Tier 2 — Official / semi-official APIs

| Source | What we tried | Result |
|--------|---------------|--------|
| **Companies House API** | Official REST API + public page scraping + filings | **Accessible** but **rarely contains phone/email** for new companies |
| **Companies House filings** | PDF/HTML document parsing | **Accessible** but **almost never has contacts** for new incorporations |
| **Yolist** (`yolist.uk/api/v1`) | Free REST API, 60 req/min, no key required | **API works** but **returned 0 businesses** for tested postcodes; **no email field** in schema; phone often masked without API key |
| **FSA Food Hygiene Ratings** (`api.ratings.food.gov.uk`) | Free official API, no key | **API works** but **food/catering sector only**; phone field often empty; no email |
| **OpenCorporates** | Company registry aggregator | **Stub/insufficient** — no contact data |
| **SIC Codes UK API** | Business classification lookup | **404** — deployment not found |

### Tier 3 — Council open data (supplementary only)

| Source | What we tried | Result |
|--------|---------------|--------|
| **Harlow Council business rates CSV** | Open data CSV download | **200 OK** — useful for **trading name + address matching**, not phone/email |
| **Leeds datamillnorth CSV** | Open data CSV download | **200 OK** — same, identity signal only |
| **Manchester Council CSV** | Open data | **403/404** — blocked |
| **Barnet Council CSV** | Open data | **403/404** — blocked |
| **Calderdale Council CSV** | Open data | **403/404** — blocked |

Council data helps verify “is this the same company?” but does **not** provide phone or email.

### Tier 4 — Search engines (explicitly excluded or unreliable)

| Source | What we tried | Result |
|--------|---------------|--------|
| **Google Custom Search (CSE)** | Paid-tier free quota API | **Implemented then removed from default chain** — you explicitly forbade it; also not configured |
| **DuckDuckGo** | HTML search scraping | **Unreliable/timeouts** — disabled by default, not a hard dependency |
| **Bing Search API** | — | **Never used** — explicitly forbidden (billing) |

### Tier 5 — Things we deliberately did NOT try

- Paid enrichment APIs (Clearbit, Apollo, Hunter.io, etc.)
- Paid proxies or residential IP services
- Paid UK business directories
- Contact form submission or email sending
- Social media scraping at scale
- LinkedIn automation

All excluded by your $0 and no-outreach rules.

---

## Live testing history (real companies, not synthetic)

| Test run | Companies | No website | Phones found | Emails found |
|----------|-----------|------------|--------------|--------------|
| Early live test (~12 companies) | 12 | 6 | **0** | **0** |
| Final feasibility test (Aug 28) | 10 | 4 | **0** | **0** |
| **All-time database total** | **50** | **38** | **0** | **0** |

Synthetic/unit tests prove the **logic** works (mock providers return verified contacts correctly). Live tests prove **real-world coverage is zero**.

---

## Architecture and key technical decisions

**Stack:**

- TypeScript / Node.js
- Prisma ORM → PostgreSQL (Neon free tier)
- Axios for HTTP, Cheerio for HTML parsing
- Jest for unit tests
- Google Apps Script webhook for Sheets (zero-cost, no Google Cloud billing)

**Key design patterns:**

- **Modular provider abstraction** — each source is a `PublicSourceProvider` with `fetchPages()`
- **Enrichment budgets** — per-company timeouts and fetch limits prevent runaway crawling
- **PublicSourceSession** — tracks blocked providers across a run
- **Contact verifier** — scores whether extracted phone/email belongs to the same company
- **Merge protection** — never overwrites existing valid contacts with null
- **Re-enrichment schedule** — retries incomplete leads on days 1, 3, 7, 14, 30 (in case contacts appear later)
- **Checkpoint system** — tracks last successful scan date for incremental processing
- **All-companies model** — every company kept with `website_status` (`WEBSITE_EXISTS` / `NO_WEBSITE`)

**Database schema (Company table):**

- Official fields: name, address, incorporation date, status, type
- Website fields: `website_status`, `website_url`, `website_source`, `website_confidence`
- Contact fields: phone/email + source URL, source type, confidence, last checked, missing reason
- Processing fields: `contact_status`, `processing_status`, enrichment attempts

**What was removed/fixed during development:**

- Fake contact injection bug (`020 7123 4567` / `info@example.co.uk`) — removed
- Leads-only discard logic — reverted to keep all companies
- Google CSE removed from default provider chain
- Council rates limited to identity matching only

---

## The feasibility conclusion

After testing every reasonable free UK source:

1. **Phone coverage at $0?** **No.** 0% across 38 no-website companies and multiple provider rounds.

2. **Email coverage at $0?** **No.** Even harder — no free API exposes email for generic new UK companies.

3. **Would more UK sources help?** **Unlikely.** The pattern is consistent: directories block bots (403), official APIs lack contact fields, sector APIs (FSA) cover tiny slices, council data has no contacts.

4. **Is automated contact enrichment viable at $0?** **No.** The UK contact-enrichment requirement **cannot be met** under your constraints.

**What IS viable at $0:**

- Discovering new companies daily
- Storing official company data
- Classifying website status reliably
- Building a structured NO WEBSITE lead list for your manual outreach
- Syncing to Google Sheets

**What is NOT viable at $0:**

- Automatically finding phone numbers for newly incorporated no-website UK companies
- Automatically finding email addresses for the same segment

---

## What you should use this project for

Treat it as a **lead discovery and classification engine**, not a contact enrichment engine:

1. Run daily scans → get new companies
2. Filter Google Sheet for `NO WEBSITE` rows
3. **You manually** find phone/email (LinkedIn, Companies House filings you read yourself, calling registry offices, etc.)
4. Optionally enter contacts back into the sheet yourself

The pipeline saves you the work of **finding and classifying** new companies. It cannot save you the work of **finding their contacts** without paid tools or manual effort.

---

## Setup (quick start)

### 1. Clone and install

```bash
git clone https://github.com/Alinaveedbutt/uk-company-data-pipeline.git
cd uk-company-data-pipeline
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in values. **Never commit `.env`.**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `COMPANIES_HOUSE_API_KEY` | Yes | Free key from [Companies House Developer Hub](https://developer.company-information.service.gov.uk/) |
| `GOOGLE_SHEETS_WEBHOOK_URL` | For sync | Apps Script Web App URL |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | For sync | Shared secret matching Script Properties |

See `.env.example` for optional tuning variables.

### 3. Database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Run

```bash
npm run scan          # Daily pipeline
npm run health        # Check connections
npm test              # Unit tests
npm run test:live     # Bounded live test (max 10 companies)
```

### 5. Google Sheets

Deploy `google-apps-script/Code.gs` as a Web App in your Google Sheet. Set `WEBHOOK_SECRET` in Script Properties.

---

## Project structure

```
src/
  companies-house/     # CH API client + rate limiter
  discovery/           # Website detection + public-source providers
  contacts/            # Phone/email extraction + verification
  pipeline/            # Main orchestration + enrichment merge
  google-sheets/       # Webhook sync client
  database/            # Prisma client
  enrichment/          # Per-company budgets
prisma/
  schema.prisma        # Database schema
  migrations/          # SQL migrations
google-apps-script/
  Code.gs              # Sheets webhook receiver
```

---

## Remaining items (when you're ready)

| Item | Status |
|------|--------|
| **GitHub Actions deployment** | Workflow can be added for daily remote runs |
| **Google Sheets column update** | Redeploy updated `Code.gs` for Website Status columns |
| **Yolist free API key** | Optional — might unlock unmasked phones if directory has data |
| **More provider experiments** | **Stopped** — evidence says they won't help at $0 |

---

## One-sentence summary

**This project reliably discovers new UK companies and tells you which ones have no website — but under strict $0 constraints, it cannot automatically find their phone numbers or emails because every accessible free source either blocks automated access, lacks contact fields, or returns empty results for newly incorporated companies.**

---

## License

Private project — all rights reserved unless otherwise specified by the repository owner.
