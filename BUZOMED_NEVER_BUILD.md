# Buzomed — Never Build List

**Purpose:** This document defines what Buzomed will deliberately **not** be. Every feature listed here was considered, evaluated, and rejected. The list exists to protect the product from feature creep, especially when a prospect, design partner, or my own enthusiasm pushes toward "we should add X."

**Rule:** If a feature appears below, the answer is no. Not "not yet." No. If the answer ever changes, it changes here first, with a written rationale, and only after the core 7 workflows are obviously better than every competitor.

**Last updated:** May 2026

---

## The mindset

Buzomed is a **scalpel** for medicina muncii.
MedSoft, Charisma, and the rest are **swiss army knives** for general clinics.

We don't try to be a swiss army knife. We never will be. The customer who needs a swiss army knife is not our customer — they have MedSoft, they're fine, leave them alone. Our customer is the practitioner who is tired of fighting a tool that does 47 things badly when they only need 7 things done well.

Every feature we *don't* build is a sharper scalpel. Every feature we add that's outside medicina muncii blunts the edge.

---

## Never build

### 1. Stock & inventory management
- Consumables, medications, equipment tracking
- FIFO accounting, NIR, transfer between gestiuni
- Inventory reports, stock alerts

**Why not:** Medicina muncii cabinets don't have meaningful stock. A spirometer, an audiometer, some forms, a stethoscope. No medications dispensed, no consumables of consequence. This is a feature for general clinics and dental practices. We are neither.

**If asked:** "Buzomed is for medicina muncii — we don't manage clinic inventory. If you also run a general practice and need stock management, keep using your existing tool for that. Buzomed sits alongside it for the medicina muncii side."

---

### 2. Cash register / fiscal receipt integration
- Bon fiscal printing
- Casa de marcat connection
- POS device drivers

**Why not:** Medicina muncii services are invoiced to **companies**, not paid in cash by patients. The customer pays by bank transfer against an invoice — there's no fiscal receipt moment. This is a general-clinic feature for walk-in private consultations.

**If asked:** "Our customers invoice companies, not individuals. We have invoicing; we don't have cash register integration because nobody's paying in cash at a medicina muncii cabinet."

---

### 3. Patient marketing & engagement
- Birthday SMS campaigns
- Promotional offers
- Loyalty cards / fidelity programs
- "We miss you" reminder campaigns
- Marketing analytics

**Why not:** Employees don't choose their medicina muncii provider — their employer does. There is no patient marketing funnel. The employee shows up because HR told them to. Building marketing features for an audience that doesn't exist is wasted engineering.

**If asked:** "Our customer is the cabinet, and their customer is the company HR department, not the individual employee. We don't build features for marketing to individual patients because that's not how this market works."

---

### 4. General appointment scheduling for walk-in patients
- Online booking widgets for patients to book themselves
- Public-facing scheduling pages
- Patient app for booking
- Calendar sync to Google/Outlook for individual patients

**Why not:** Examinations are scheduled **by the company in bulk** — "we have 47 employees due for periodic, here's the list." Not by individual patients picking a time. Building consumer-grade self-booking creates UX expectations that don't fit the actual workflow.

**What we do instead:** Workflow 3 (Examination scheduling) handles bulk scheduling against a company's roster. Practitioners pick a date range and the system slots the examinations.

**If asked:** "Bulk scheduling against company rosters is our specialty. Individual patient self-booking isn't a workflow that exists in medicina muncii."

---

### 5. Electronic health record for general medical practice
- General consultations
- Specialty modules (dermatology, cardiology, etc.)
- Lab integration for non-occupational tests
- Prescription writing
- e-Reteta
- Long-term chronic disease tracking

**Why not:** Medicina muncii is a narrow scope: examen la angajare, examen periodic, examen la reluarea activității, examen la încetare. We record what's needed for the fișa de aptitudine — nothing more. If a practitioner needs full EHR for unrelated consultations, that's MedSoft territory.

**If asked:** "We're not a general EHR. We do occupational examinations and their documentation, which is a different workflow than consultations."

---

### 6. CNAS / SIUI / DRG / SIPE / CEAS integration
- National Insurance House reporting
- DRG reporting
- e-Card validation

**Why not:** Medicina muncii is paid by the employer, not by CNAS. It's outside the public health insurance system. None of these reporting requirements apply.

**If asked:** "Medicina muncii isn't reimbursed by CNAS, so we don't integrate with their reporting systems. That would be relevant if we did general medical practice — but we don't."

---

### 7. Accounting software integration
- ContaFin, Saga, Smartbill, etc.
- Export to accounting format files
- General ledger sync

**Why not:** We generate invoices and track payments. The accountant takes it from there. Building bidirectional accounting integration is a rabbit hole (every accounting tool has its own quirks) and the practitioner already has a workflow for sending invoices to their accountant — usually email or shared folder.

**Maybe later (post-launch, post-PMF, only if many customers ask):** A simple CSV export of invoices in a standard format. That's the maximum. Not real-time sync, not API integration.

**If asked:** "We give you clean, downloadable invoices in PDF and CSV. Your accountant handles the rest — same way they always have."

---

### 8. Telemedicine / video consultations
- Video calls
- Screen sharing
- Recording sessions

**Why not:** Medicina muncii examinations require physical presence — blood pressure, vision tests, audiometry, spirometry, dexterity tests. You cannot examine someone for fitness-to-work over Zoom. Telemedicine is for follow-up consultations on chronic conditions, which we don't do (see #5).

**If asked:** "Occupational examinations are physical exams by definition. There's no video version."

---

### 9. Multiple deployment options
- Windows native app
- iOS/Android native apps
- On-premise self-hosted version

**Why not:** We are a cloud-only SaaS. One codebase, one deployment model, one runtime. Native apps triple the engineering burden for marginal benefit. Modern web on mobile is good enough for medicina muncii workflows. On-premise destroys the multi-tenant economics.

**What we do instead:** Excellent responsive web that works well on tablet for in-cabinet use and on phone for "quick check what's expiring this week."

**If asked:** "Buzomed runs in the browser, including on tablet and phone. We've intentionally not built native apps — they would slow us down without adding meaningful value for this workflow."

---

### 10. Custom report builder
- User-defined report templates
- Drag-and-drop report designer
- Scheduled report email delivery

**Why not:** Custom report builders are a maintenance nightmare and become the support team's permanent home. We will build a small set of **excellent** standard reports (the 5-7 reports a medicina muncii cabinet actually needs) and one CSV export per data table. That's the deal.

**If asked:** "We have the standard reports a cabinet needs. If you need something we don't have, export to Excel and slice it there — that's almost always what people end up doing anyway with custom report tools."

---

### 11. White-labeling / reseller program
- Custom domain per customer
- Custom branding per customer
- Reseller accounts

**Why not:** Distractions. We are not a platform. We are a product. Wait until we have a clear reason — like a multi-cabinet network customer who insists — and then think about it. Until then, every customer sees Buzomed branded as Buzomed.

---

### 12. AI features that are gimmicks
- "Chat with your data" if there's no real workflow benefit
- AI scribe for examinations (the form is already short)
- AI-generated summaries that nobody reads
- Auto-coding ICD-10 from free text (we don't need ICD-10 codes)

**What we do build (AI that earns its place):**
- Hazard profile suggestion from a company's CAEN code (workflow 1)
- Smart column matching for Excel imports of employee rosters (workflow 2)
- Pre-filling examination findings from a patient's prior visit + flagging changes (workflow 4)
- Generating the narrative section of annual company health reports from structured data (workflow 7)

**Rule:** AI features are only built when they make a real workflow noticeably faster or more accurate, and only after the non-AI version of that workflow already works.

---

### 13. Stomatology / dental module
- Tooth charts, treatment plans
- Dental imaging integration

**Why not:** Self-explanatory. We are not a dental product. SPS Medical's positioning shows what happens when you try to be both — you end up being mediocre at both.

---

### 14. Multi-language beyond RO + EN + DE
- French, Italian, Spanish, etc.

**Why not:** RO is the home market. EN serves international staff and DACH exports of fitness certificates. DE is for the DACH expansion. Anything else is feature scope without a market — we'd be supporting another language with no customers in that language. Add a language only when there's a paying customer asking for it.

---

### 15. Patient portal / self-service
- Patients log in to see their own examination history
- Patients book their own examinations
- Patients fill in pre-examination questionnaires online

**Why not:** Same reason as #4. The employee is not the customer. They don't need a portal because they're not making decisions. Their HR department schedules them; they show up. Adding a patient portal builds infrastructure (auth, security, GDPR consent flows for individuals) for no business reason.

**Maybe later:** Pre-examination questionnaires (chestionar de anamneza) filled in on a tablet handed to the patient in the waiting room. That's not a portal — that's a kiosk flow. Different thing.

---

### 16. Integration with medical devices
- Spirometer connection
- Audiometer connection
- Vision tester connection

**Why not:** Each device has its own protocol, its own driver, its own quirks. This is a multi-year engineering project to support 5-6 device families across multiple manufacturers. The current workflow (practitioner enters values manually after the test) takes 30 seconds. We are not solving a problem painful enough to justify the engineering cost.

**Maybe later (year 3+, post-PMF, only with a clear customer-funded path):** One device family, one manufacturer, one integration, if a customer explicitly asks and is willing to pay for the integration work.

---

## How to use this document

1. **Before building any new feature**, search this file. If it's listed → the answer is no.
2. **When a prospect or design partner asks for a feature listed here**, read the "If asked" line and respond accordingly. Position the refusal as focus, not limitation.
3. **When you feel the urge to build something because a competitor has it**, come back to this file and reread the "Why not" sections. Remember: feature parity is a losing race for a solo founder.
4. **Adding to this list is encouraged.** When you reject a feature request, write it in here so you don't have to relitigate the decision next time.
5. **Removing from this list requires a written rationale.** Don't quietly walk back a "never." If something moves from "never build" to "in scope," the document must explain what changed — a new market signal, a clear customer demand backed by willingness to pay, or a strategic shift.

---

## The test, one more time

If a feature isn't in service of one of the 7 core workflows (see `BUZOMED_CORE_WORKFLOWS.md`), it doesn't get built. Period.
