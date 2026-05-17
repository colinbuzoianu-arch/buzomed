# Buzomed — Core Workflows

**Purpose:** This document defines the **complete product**. There are 7 workflows. They are the spine of Buzomed. Anything not in service of these workflows is out of scope (see `BUZOMED_NEVER_BUILD.md`).

**The rule of obvious betterness:** For each workflow, the goal is not feature parity with MedSoft/Qmedical/SPS Medical. The goal is to be **obviously better** at this specific task — so much so that a practitioner trying it for the first time says "oh, *this* is how it should work."

If we can only match the competition on a given workflow, we have not done our job. Find the angle that makes it genuinely faster, cleaner, or more accurate.

**Last updated:** May 2026

---

## The 7 workflows

1. **Company & contract onboarding** — a new company becomes a customer
2. **Employee roster management** — adding, updating, and bulk-importing employees of customer companies
3. **Examination scheduling** — planning who gets examined when, against company rosters
4. **Conducting an examination** — recording findings, decisions, recommendations
5. **Issuing the fișa de aptitudine** — generating, signing, archiving, and tracking expiration
6. **Invoicing & contract billing** — generating invoices against contracts, tracking payments
7. **Reporting** — annual company health reports, regulatory reports, internal cabinet stats

That's it. Seven workflows. No eighth.

---

## Workflow 1 — Company & contract onboarding

### What the practitioner is doing

A new company contacts the cabinet wanting a medicina muncii contract. The practitioner needs to:
- Register the company (CUI, name, address, contact people)
- Define the contract terms (start date, duration, services, price)
- Identify the company's workplaces / locations
- For each workplace, define the hazard profile (noxe) that applies to all employees working there
- Save it, ready to start adding employees and scheduling examinations

### Where competitors are weak

- **MedSoft, Qmedical, SPS:** Hazard profiles are tied to **employees** (per-post or per-person), not to workplaces. This means defining the same hazard profile 200 times for 200 employees doing the same job at the same location. Tedious, error-prone, hard to update when a workplace risk changes.
- All competitors: manual data entry for company details, no auto-fill from CUI lookup.

### Buzomed's obvious betterness

- **Per-workplace hazard profiles.** Define the noxe once for a workplace ("Production Hall A"). Every employee assigned to that workplace inherits the profile. Change the profile → all employees update.
- **CUI auto-lookup** — paste the CUI, we fetch company name, address, CAEN code from ANAF.
- **CAEN-based hazard suggestions (AI):** based on the company's CAEN code, suggest a starting hazard profile. Example: CAEN 2511 (metal structures fabrication) → suggest profiles for noise, dust, welding fumes, manual handling, slip/fall. Practitioner confirms or edits. Saves 10-15 min of profile-building.
- **Per-tenant-per-year contract numbering** automatic, no manual sequence keeping.

### MVP scope for Session 4

- Companies CRUD
- Contracts CRUD (linked to company)
- Workplaces CRUD (linked to company)
- Hazard profiles CRUD (linked to workplace)
- CUI lookup (later — needs ANAF API integration)
- CAEN-based AI suggestions (later — V2)

### What success looks like

A practitioner can onboard a new 50-employee manufacturing company with 3 workplaces and proper hazard profiles in **under 10 minutes**. The same task in MedSoft takes 30-45 minutes (because of per-employee hazard profile entry).

---

## Workflow 2 — Employee roster management

### What the practitioner is doing

The company sends a list of employees (usually an Excel file from their HR system). The practitioner needs to:
- Import the list, mapping columns to Buzomed fields
- Validate CNPs, dates of birth, employment dates
- Assign each employee to a workplace
- Update the list when the company adds or removes employees
- Look up an individual employee by name, CNP, or company

### Where competitors are weak

- Manual one-by-one entry is still the default in most tools
- Where import exists, it requires a specific column order — practitioner has to reformat the company's Excel before uploading
- No deduplication when the same employee appears in two companies (someone with two jobs)
- CNP validation is inconsistent
- Workplace assignment is a separate step from import (so a 200-row import becomes a 200-row workplace-assignment task afterwards)

### Buzomed's obvious betterness

- **Smart column matching (AI):** upload any Excel file. We detect which column is "name," which is "CNP," which is "job title," even if labeled differently or in different languages. Practitioner confirms the mapping, we proceed.
- **CNP validation on the fly** — invalid CNPs are flagged before import, not after.
- **CNP as global identifier** — if the same CNP exists in another company in this tenant, we link them (employee X works for both companies, only one patient record).
- **Workplace assignment during import** — if the Excel has a "department" or "location" column, we map it to workplaces. Practitioner reviews the mappings once, applies to all 200 employees in one click.
- **Diff-based updates** — when the company sends an updated roster, we show what changed: 12 new employees, 3 left, 5 moved workplaces. Practitioner confirms; we apply.

### MVP scope for Session 4

- Employees CRUD
- Workplace assignment per employee
- CNP validation
- (Excel bulk import — V2, post-MVP)

### What success looks like

A practitioner imports a 200-row employee Excel file in **under 3 minutes**, with all employees correctly assigned to workplaces. Same task in MedSoft = ~2-4 hours of manual work or a fragile CSV import.

---

## Workflow 3 — Examination scheduling

### What the practitioner is doing

The cabinet needs to plan when examinations happen. Sources of demand:
- Periodic examinations due (annual, semi-annual depending on hazard profile)
- New hires (examen la angajare) — usually within a few days
- Return-from-leave (examen la reluare)
- Post-illness or post-accident
- Special cases (pregnant employees, night shift transfers)

The practitioner needs to:
- See who's due, when
- Schedule batches of employees from the same company on the same day
- Reschedule when someone doesn't show up
- Notify the company of the schedule

### Where competitors are weak

- Generic appointment systems borrowed from general clinics. Built around individual patient bookings, not against company rosters.
- No "who's expiring this month" dashboard — practitioner has to dig through individual records.
- No bulk scheduling — book 20 employees from one company, requires 20 separate appointment entries.

### Buzomed's obvious betterness

- **Expiration dashboard** — landing page shows: "47 examinations expire in the next 30 days, grouped by company." One click to schedule a batch.
- **Bulk scheduling** — pick a date range, pick a company, system slots the employees into time slots (default: 20 min per examination, configurable). Practitioner adjusts, confirms.
- **Auto-calculated next-due dates** based on hazard profile (legal interval) with manual override per employee if needed.
- **Company notification** — one click sends the company HR a PDF or Excel with the schedule.
- **No-show handling** — if employee doesn't show, one click to reschedule; the system tracks the rescheduling and updates the company.

### MVP scope for Session 4 / 5

- Examinations CRUD with status (scheduled, completed, missed, cancelled)
- Per-workplace next-due-date calculation (using hardcoded legal intervals + override)
- Expiration dashboard
- Bulk scheduling (V2)
- Company notification (V2)

### What success looks like

A practitioner sitting down on Monday morning sees exactly who needs to be scheduled this week, schedules 30 examinations across 4 companies in **under 20 minutes**, and the company HR gets a clean PDF schedule. In MedSoft this is a multi-hour calendar-building exercise.

---

## Workflow 4 — Conducting an examination

### What the practitioner is doing

Employee arrives. Practitioner:
- Opens the employee's record
- Reviews medical history (especially prior fișe and any findings)
- Conducts the examination (anamneza, physical exam, eventual tests like spirometry, audiometry, vision)
- Records findings in the examination form
- Decides: APT, APT condiționat (with restrictions), INAPT temporar, INAPT
- Adds recommendations if any (e.g., "needs glasses for screen work")

### Where competitors are weak

- Generic patient consultation forms — not optimized for medicina muncii structure
- No "compare with previous examination" view — practitioner has to manually flip between fișe to see if something has changed
- Free-text everywhere — slow to fill, hard to report on later
- No hazard-profile-driven examination templates — same form regardless of whether the patient works with noise, chemicals, or screens

### Buzomed's obvious betterness

- **Hazard-profile-driven examination forms** — the form adapts to the employee's workplace. Welder profile → mandatory eye exam, lung function, dermatological check. Office worker → vision, posture, mental health screening. Right fields, no extras.
- **Prior-visit comparison** — when opening an examination, the previous one is visible side-by-side. Changed values are highlighted.
- **Pre-fill from prior visit + AI flagging of changes** — start with last visit's findings as the baseline, AI flags significant changes ("blood pressure +15/+10 vs last year, worth attention"). Practitioner confirms or modifies.
- **Structured fields with free-text fallback** — most findings are dropdowns or checkboxes (so we can report on them), with a "notes" field for everything else.
- **Decision-making support** — based on findings and hazard profile, system suggests a fitness decision and required restrictions. Practitioner overrides freely.

### MVP scope for Session 4 / 5

- Examinations have a form (V1: generic, V2: hazard-driven)
- Fitness decision (APT, APT condiționat, INAPT temporar, INAPT)
- Recommendations field
- Prior-visit comparison (V2)
- AI features (V3)

### What success looks like

An average examination data entry takes **3-5 minutes** instead of 10-15 minutes. The practitioner spends more time with the patient and less time fighting the software.

---

## Workflow 5 — Issuing the fișa de aptitudine

### What the practitioner is doing

After the examination, the practitioner needs to:
- Generate the fișa de aptitudine (legal document, standard format per HG 355/2007)
- Sign it (electronic signature, or print and physical sign)
- Save a copy to the employee record
- Send to the company (often by email or shared folder)
- Set the next examination due date

### Where competitors are weak

- Generic template engines — fișa formats are sometimes outdated or don't match current legal requirements
- No bilingual generation — if the company is German-owned and wants German-language fișe, practitioner reformats manually
- Electronic signature is often an afterthought or external tool
- No audit trail of which version of the fișa was sent where

### Buzomed's obvious betterness

- **Always-current legal templates** — we maintain the official template, including any HG 355 updates. Practitioner never worries about whether the format is current.
- **One-click PDF generation** — examination → fișa, instantly.
- **Bilingual output** — RO version always; on demand, generate an EN or DE version of the same fișa (same fitness decision, translated form). Massive value for foreign-owned manufacturers.
- **Electronic signature built in** — practitioner signs with stored credentials. Audit-trailed.
- **One-click company delivery** — email the fișa to the company contact, with a log of when it was sent and to whom.
- **Automatic expiration tracking** — fișa is issued → next-due date is set → appears on the expiration dashboard at the right time.

### MVP scope for Session 4 / 5

- PDF generation (V1)
- Archival in employee record (V1)
- Electronic signature (V2)
- Bilingual output (V2)
- Email delivery (V2)

### What success looks like

From "examination complete" to "fișa in the company's inbox" takes **under 2 minutes**, including bilingual generation if needed. In MedSoft this involves PDF export, manual email, separate filing — typically 5-10 minutes.

---

## Workflow 6 — Invoicing & contract billing

### What the practitioner is doing

Medicina muncii services are invoiced to **companies**, against contracts. The practitioner needs to:
- Generate invoices (monthly batch, or per-examination)
- Apply correct VAT (medicina muncii is VAT-exempt in Romania under specific conditions; mixed cabinets need to handle both)
- Send the invoice to the company
- Track payment (paid / unpaid / overdue)
- Generate a payment reminder when overdue
- Export invoices for the accountant

### Where competitors are weak

- Invoicing is often a separate module bolted on, with its own UX
- VAT handling for VAT-exempt medical services is sometimes wrong out of the box
- No clear "what's owed" dashboard — practitioner has to dig
- Accountant export is usually clunky CSV

### Buzomed's obvious betterness

- **Native to the contract** — an invoice is a one-click generation from a contract with completed examinations attached. No re-entry.
- **Correct VAT handling** — VAT-exempt for medicina muncii, with a clear "this service is VAT-exempt under Art. X" line on the invoice. Mixed-VAT cabinets handled correctly.
- **Outstanding dashboard** — landing page widget shows: "3 invoices overdue, 7,200 RON total. 4 invoices due this week."
- **One-click reminders** — overdue invoice → "Send reminder" → email goes to company contact with the original invoice attached.
- **Clean monthly export** — one PDF, one CSV, both formatted for what the accountant needs. Optional: generate the e-Factura XML for ANAF submission.

### MVP scope for Session 4 / 5

- Invoices CRUD (V1)
- VAT-exempt handling (V1)
- Outstanding dashboard (V2)
- e-Factura XML export (V2)
- Reminders (V2)

### What success looks like

Monthly invoicing for a 10-company cabinet takes **under 30 minutes**, including reviewing each invoice and sending them out. In MedSoft this is typically half a day of monthly admin.

---

## Workflow 7 — Reporting

### What the practitioner is doing

Three audiences:
1. **The company** wants an annual report: "How healthy is our workforce? What conditions are we seeing? Any concerning trends?"
2. **The cabinet manager / practitioner** wants internal stats: examinations completed, revenue per company, capacity utilization, examinations by hazard category
3. **Regulatory bodies** want occasional reports — DSP requests, ITM inspections, etc.

### Where competitors are weak

- Custom report builders that are powerful but unusable — practitioners end up exporting to Excel anyway
- Generic clinic-style reports that don't map to medicina muncii reporting requirements
- Annual company health reports usually built manually in Word

### Buzomed's obvious betterness

### MVP scope for Session 5 / 6

- CSV exports for all major tables (V1)
- Cabinet activity dashboard (V1)
- Annual company health report (V2 with AI)
- Hazard exposure report (V2)
- Regulatory snapshot (V3)

### What success looks like

Generating an annual health report for a company takes **15 minutes** (review and sign off on AI-generated draft), not the 4-6 hours of manual report writing it currently takes.

---

## How the workflows connect

```
   Workflow 1                Workflow 2
   Company & contracts  ←→   Employee roster
        ↓                          ↓
        └──────── workplaces & hazards ────────┘
                          ↓
                     Workflow 3
                  Examination scheduling
                          ↓
                     Workflow 4
                  Conducting examinations
                          ↓
                     Workflow 5
                Issue fișa + set next due
                          ↓
              ┌──────────┴──────────┐
              ↓                     ↓
         Workflow 6            Workflow 7
         Invoicing             Reporting
```

The workflows are not isolated features — they're stages in a single value chain. The output of each becomes the input of the next. This is what "purpose-built for medicina muncii" actually means.

---

## Build order

**Session 4 (next):** Workflows 1 + 2 — companies, contracts, workplaces, hazard profiles, employees. The foundation.

**Session 5:** Workflows 3 + 4 — scheduling and examinations.

**Session 6:** Workflow 5 — fișa generation, the legal output of the system.

**Session 7:** Workflow 6 — invoicing and the financial side.

**Session 8:** Workflow 7 — reports. By this point the data exists to report on.

**Sessions 9+:** AI features added on top, one workflow at a time. Hazard suggestion (W1) → smart import (W2) → comparison and pre-fill (W4) → narrative reports (W7). In that order.

**At no point** do we widen beyond these 7. Anything new must replace something in the NEVER_BUILD list (with a written rationale), or stay out.

---

## The 60-second elevator pitch (so you have it ready)

> Buzomed is a SaaS built specifically for medicina muncii cabinets — not a general clinic system with an occupational module bolted on. We do seven things obviously better than anyone else: company onboarding with per-workplace hazard profiles, bulk employee imports with smart Excel matching, scheduling against company rosters, hazard-driven examination forms, one-click bilingual fișe de aptitudine, contract-native invoicing, and annual company health reports with AI-assisted narrative.
>
> Practitioners using Qmedical or MedSoft can do all of this — slowly. We make it fast. We're priced at 149 RON/month for solo cabinets and 349 for clinics, with EU hosting in Frankfurt and a bilingual RO/EN interface from day one, German next. Built for Romania, designed to expand to DACH.
