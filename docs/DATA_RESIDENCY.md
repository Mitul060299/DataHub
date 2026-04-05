# Data Residency Strategy

## Current State (April 2026)

**One bucket — AWS S3 ap-south-1 (Mumbai). This is correct for the current stage.**

All user data is stored in a single AWS S3 bucket in the Mumbai (ap-south-1) region.
This is the right call for a 0–50 user India-first launch.

---

## Compliance Status by Region

### India (DPDP Act 2023)
- **Status: Compliant ✅**
- Mumbai bucket = Indian users' data stays in India
- Aligns perfectly with the Digital Personal Data Protection Act 2023
- No action needed

### EU (GDPR)
- **Status: Low risk at current stage**
- Technically, storing EU residents' personal data outside the EU requires "appropriate safeguards"
- AWS has Standard Contractual Clauses (SCCs) in place for all regions including Mumbai
- Our Privacy Policy states data may be transferred internationally
- EU enforcement has never targeted pre-revenue Indian SaaS startups
- **Action needed when:** First EU enterprise client asks for a DPA or data residency guarantee

### US (CCPA / Federal)
- **Status: No compliance issue ✅**
- No US federal law requires SaaS data to stay within the US
- HIPAA, FedRAMP, ITAR do not apply to our market
- CCPA requires privacy disclosures (done) — does NOT require California data residency
- **Action needed when:** Never, unless entering healthcare/government verticals

---

## When to Add More Regions

### Trigger 1 — First EU enterprise client asks about data residency
- Tell them: "EU-region storage is on our roadmap for enterprise customers"
- Note their email
- Build it when 3+ EU users ask
- **Action:** Create `eu-west-1` (Ireland) bucket + geo-routing logic

### Trigger 2 — Latency complaints from EU/US
- Mumbai → EU latency adds ~150–200ms
- Noticeable above 50MB file uploads
- Not a concern at current file size limits

### Trigger 3 — YC / investor due diligence
- Have the 3-region architecture plan ready as a scaling answer:
  > "Currently Mumbai for Indian launch. Plan to add eu-west-1 and us-east-1 when we have
  > paying users in those regions."
- This answer is fully acceptable at Series A and earlier

---

## Target Multi-Region Architecture (implement when triggered)

```
3 buckets:
  datahub-ap-south-1   →  Mumbai      (India / Asia-Pacific)
  datahub-eu-west-1    →  Ireland     (EU / UK)
  datahub-us-east-1    →  N. Virginia (US / Americas)

Geo-routing:
  1. Detect user country at signup (from IP or billing address)
  2. Assign bucket_region on user record in Supabase
  3. All S3 calls route to the user's assigned bucket

Cost:
  $0 setup · same $0.023/GB storage · only pay for what's stored per region

Implementation time: ~1–2 days
```

---

## What to Tell EU/US Users If Asked Right Now

> "DataHub stores data on AWS infrastructure in the Asia Pacific (Mumbai) region.
> We are GDPR-aware and have appropriate safeguards in place via AWS's Standard
> Contractual Clauses. EU-region storage is on our roadmap for enterprise customers."

This is honest, defensible, and satisfies 95% of users who ask.
The 5% who need contractual guarantees are enterprise clients not targeted at this stage.

---

## Action Timeline

| Trigger | Action |
|---|---|
| **Today** | Nothing — Mumbai is correct |
| First EU user asks about data residency | Note their email; reply with roadmap statement above |
| 3+ EU users ask, or first EU enterprise signup | Create `eu-west-1` bucket; add geo-routing; update Privacy Policy |
| YC acceptance / Series A due diligence | Present 3-region scaling plan |
| US healthcare/government vertical (future) | Evaluate HIPAA-compliant storage separately |

---

## Related Files
- `frontend/src/pages/PrivacyPage.tsx` — Section 9: International Data Transfers
- `docs/COMPLIANCE.md` — broader compliance overview
- `docs/DEPLOYMENT.md` — AWS S3 setup details
