# Market Research — Two-Sided Sales Job Boards

*Compiled 2026-09-22 as input to `SPEC-v2-DRAFT.md`. Sources at bottom.*

## 1. How current job boards handle the two sides

| Platform | Supply side (candidates) | Demand side (employers) | How the two sides meet | Who pays |
|---|---|---|---|---|
| **LinkedIn / Indeed** | Generic profile / resume | Job posts, recruiter search | Candidate applies **or** recruiter messages (InMail) | Employers: pay-per-click posts, recruiter seats |
| **Wellfound** | Profile with salary expectations, equity comfort, preferred company stage | Free job posts; paid seats for search + outbound | Both directions: apply **and** recruiter outreach ("reverse marketplace") | Employers: free posts, ~$250–500/seat/mo, managed sourcing, ~10% placement fee on Autopilot |
| **RepVue** | Anonymous ratings of past sales orgs (in exchange for free data access) | Company profiles, job listings | Reps research companies (quota attainment, OTE, culture) then apply | Employers (employer branding + jobs) |
| **Bravado** | Community (War Room) + "Seller Portfolio": products sold, customers, testimonials | Vetted company list, job board | Community keeps reps engaged, jobs capture intent | Employers |
| **Sellfolio / SalesProof / Proven Reps / Proven Sales** | Verified rep performance: attestation, manager validation, references, system proof, W-2 verification | Hiring dossiers, pre-vetted talent pools | Mostly employer-led sourcing of verified talent | Employers (subscriptions / placement) |
| **QuotaPath** (not a job board) | Reps have their own login showing earnings + attainment synced from Salesforce/HubSpot | Companies buy it for comp management | n/a | Employers |

## 2. Patterns worth copying

1. **Employers pay, candidates are free.** Every successful board monetizes the demand side. Candidates are the inventory.
2. **Free job posts, paid access to talent.** Wellfound's model: posting is free (solves the empty-board cold start), money is in search, outbound, and placement.
3. **Two directions of matching.** Candidate → job (apply) *and* employer → candidate (intro request). The second direction is where "verified numbers" pay off, because it's what recruiters search on.
4. **Transparency as a hook for candidates.** RepVue won rep attention with company-side data (quota attainment rate, OTE, culture). A sales job post should require OTE, base/variable split, quota, and ramp. Several US states already require pay ranges.
5. **Protect the job seeker's current job.** LinkedIn's "recruiters only" Open to Work and Wellfound's company blocking exist because reps won't join if their current employer can see them looking.
6. **Give-to-get.** RepVue gates data behind contributing a rating. The same idea works here: reps who add metrics unlock benchmark data ("where does your 112% rank among Mid-Market AEs?").

## 3. The competitive problem (read this one)

"Verified sales performance" is **not an empty lane**. At least four companies pitch it. Where this project can still win:

- **Numbers over any period, not a single screenshot.** Most competitors verify a claim ("hit 140% in 2024"). A structured time series (monthly/quarterly metrics that roll up to any period) is harder to fake, easier to compare, and more useful to hiring managers.
- **Context-aware comparison.** $1.2M closed in enterprise and $1.2M closed in SMB transactional are different jobs. Tie metrics to segment, deal size, quota, and team size so comparisons are fair.
- **Job board + proof together.** Competitors are either job boards (RepVue, Bravado) or verification tools (Sellfolio, SalesProof). Doing both is the wedge, and also the hardest part: two-sided marketplaces usually fail at cold start.

## 4. Data-import reality check

| Source | Realistic? | Notes |
|---|---|---|
| **CSV / Excel upload** | ✅ Build first | Covers Tableau (export crosstab → CSV), Salesforce report export, Excel trackers, commission statements. Cheapest and works for everyone. |
| **Salesforce OAuth** | ⚠️ Build later, carefully | The data belongs to the rep's employer. Many orgs block third-party connected apps, and some editions don't include API access. Only works while employed there. Store **aggregates only**, never customer names or deal records. |
| **HubSpot OAuth** | ⚠️ Same caveats | Easier approval flow than Salesforce and popular with SMB and startup sellers. |
| **Tableau API** | ❌ Skip | Tableau visualizes data that lives somewhere else. There's no standard "my sales numbers" object. CSV export covers it. |
| **Commission platforms (QuotaPath, CaptivateIQ, Spiff)** | 🔭 Explore later | QuotaPath gives reps their own login with attainment already computed, so it's the most "rep-owned" data source. No confirmed public export API for this use case. Needs partnership research. |

**Legal risk to take seriously:** reps pulling employer CRM data into a third-party site can breach confidentiality agreements. Mitigations: aggregates only, no customer or account names, explicit rep attestation before import, and a clear ToS. Get a lawyer's read before the Salesforce milestone ships.

## Sources
- [RepVue — Sales Organization Ratings, Reviews, Jobs, and Salary Data](https://www.repvue.com/)
- [Wellfound — Hiring Plans & Pricing](https://wellfound.com/recruit/pricing)
- [Wellfound Pricing (2026) — South](https://www.hireinsouth.com/post/wellfound-pricing)
- [Bravado Jobs](https://bravado.co/lp/jobs)
- [Sellfolio](https://www.sellfolio.net/) · [SalesProof](https://salesproof.io/) · [Proven Reps](https://provenreps.com/) · [Proven Sales](https://provensales.com/)
- [QuotaPath — free commission tracking app experience](https://www.quotapath.com/blog/free-commission-tracking-app/)
