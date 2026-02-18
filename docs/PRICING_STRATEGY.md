# DataHub Pricing Strategy – Updated Model

## Overview
Five-tier pricing model designed to serve the full spectrum from students to Fortune 500 enterprises, with clear positioning at each level.

---

## 🟢 Tier 1: Free – $0

**Target Market:** Students, analysts evaluating tool, hobbyists

**Purpose:** Lead generation + education funnel

### Specifications
| Feature | Value |
|---------|-------|
| Storage | 100 MB total |
| AI Messages/month | 50 |
| Workspaces | 1 |
| Projects | 2 |
| Datasets/Project | 3 |
| File Upload Limit | 50 MB |
| File Formats | CSV, Excel only |
| Database Connections | ❌ None |
| Support | Community only |

### Key Features
- ✅ CSV/Excel upload only
- ✅ Basic visualizations
- ✅ Community forum support
- ❌ No database connections
- ❌ No API access
- ❌ No team collaboration
- ❌ No scheduling

### Strategic Value
- Zero friction entry point
- Attracts future paying customers
- Organic marketing through students & analysts
- Low support cost
- Quick "aha moment" demo

### Success Metric
Conversion rate to Professional: 8-10% within 6 months

---

## 🔵 Tier 2: Professional – $79/user/month

**Target Market:** Independent consultants, startup analysts, solo practitioners

**Why $79?** Enterprise-adjacent pricing that feels accessible to independent practitioners.

### Specifications
| Feature | Value |
|---------|-------|
| Storage | 10 GB per user |
| AI Messages/month | 500 |
| Workspaces | 3 |
| Projects/Workspace | 10 |
| Datasets/Project | 25 |
| File Upload Limit | 1 GB |
| Support | Email (24h response) |

### Included Integrations
- ✅ PostgreSQL
- ✅ MySQL
- ✅ MongoDB
- ✅ MSSQL
- ✅ CSV/Excel/JSON/Parquet
- ✅ Export Transformations

### Key Features
- ✅ Full database connection support
- ✅ API access for custom scripts
- ✅ Transformation export (to code)
- ✅ Scheduled pipelines (basic)
- ✅ Dashboard sharing
- ❌ No team workspace controls
- ❌ No SSO
- ❌ No enterprise connectors

### Use Cases
- **Consultant**: Building client data workflows
- **Startup analyst**: Managing multiple small datasets
- **Freelancer**: Offering data services to clients
- **Solo BI team**: Single person handling analytics

### Typical Customer Profile
- Monthly data volume: 5-50 GB
- Projects: 3-5 active
- Works independently or with small teams
- Needs database integration but not governance

### Success Metric
Conversion from Free: 20-25% | Churn rate: <5%/month

---

## 🟣 Tier 3: Team – $149/user/month

**Target Market:** Consulting teams, internal analytics teams, small-to-mid size consulting firms

**Positioning:** Replaces Alteryx Creator seats ($433/month) at 1/3 the cost with better collaboration

### Specifications
| Feature | Value |
|---------|-------|
| Storage | 100 GB shared pool (not per-user) |
| AI Messages/month | Unlimited (fair usage policy) |
| Workspaces | Unlimited |
| Projects/Workspace | Unlimited |
| Datasets/Project | Unlimited |
| File Upload Limit | 5 GB |
| Support | Priority (4h response) |

### Included Integrations
- ✅ All Professional integrations
- ✅ Snowflake
- ✅ Google BigQuery
- ✅ Amazon Redshift
- ✅ Azure SQL Database
- ✅ Cloud Storage (S3, GCS, Azure Blob)

### Key Features
- ✅ Role-based access control (RBAC)
- ✅ Shared pipelines across team
- ✅ Version control for workflows
- ✅ Basic audit logs
- ✅ Team collaborations & comments
- ✅ Multiple team members on shared projects
- ✅ Workspace-level permissions
- ❌ No SSO
- ❌ No full data lineage
- ❌ No advanced governance

### Collaboration Features
- **Shared projects**: Multiple analysts can work on same pipeline
- **Version history**: See who changed what and when
- **Comments/notes**: Annotate transformations
- **Role-based viewing**: Viewer, Editor, Admin roles per workspace

### Use Cases
- **Consulting firm** (3-8 analysts): Delivering data workflows to clients
- **Internal analytics team**: Marketing/Finance analytics shared across team
- **Startup data team**: Growing analytics function
- **SMB BI function**: Replacing Tableau/Alteryx with better tool

### Typical Customer Profile
- Team size: 3-10 people
- Data volume: 50-500 GB/month
- Needs collaboration & version control
- Building enterprise data workflows
- Wants data warehouse connectors

### Competitive Positioning
| Tool | Monthly Cost (5 users) | Storage | Collaboration |
|------|----------------------|---------|---------------|
| Alteryx Creator (5 seats) | $2,165 (5 × $433) | 500 GB | Basic |
| Tableau Creator (5 seats) | $375 (5 × $75) | Limited | Minimal |
| DataHub Team (5 users) | $745 (5 × $149) | 100 GB shared | Full |
| **DataHub advantage** | **-66% vs Alteryx** | **✅** | **Superior** |

### Success Metric
Average team size: 4-5 users | Churn rate: <3%/month | Expansion revenue: 30% YoY

---

## 🟡 Tier 4: Business – $249/user/month

**Target Market:** Mid-size enterprises, serious consulting operations, regulated industries

**Positioning:** Enterprise-grade governance, compliance, and dedicated support

### Specifications
| Feature | Value |
|---------|-------|
| Storage | 500 GB – 1 TB shared pool |
| AI Messages/month | Unlimited (controlled compute policy) |
| File Upload Limit | 10 GB |
| Support | Dedicated success manager + 4h SLA |

### Advanced Security & Compliance
- ✅ **SSO/SAML**: Single Sign-On via Google Workspace, Azure AD, Okta
- ✅ **Advanced RBAC**: Custom roles, department-level controls
- ✅ **Full Audit Trail**: Every action logged with user/timestamp
- ✅ **Data Lineage Tracking**: See data flow from source to dashboard
- ✅ **Compliance Frameworks**: SOC2-ready controls, HIPAA considerations
- ✅ **IP Whitelisting**: Restrict access by network

### Performance & SLA
- ✅ SLA-backed uptime guarantee (99.5%)
- ✅ Priority infrastructure allocation
- ✅ Faster query execution
- ✅ Higher compute limits

### Enterprise Features
- ✅ API access for custom integrations
- ✅ Webhook support (real-time automation)
- ✅ Custom field mappings
- ✅ Data retention policies
- ✅ Advanced scheduling (cron-based)
- ✅ Workload management (priority queues)

### Included Integrations
- ✅ All Team tier integrations
- ✅ Custom connectors (API/FTP/SFTP)
- ✅ Enterprise data platforms

### Use Cases
- **Insurance firm**: Regulatory requirements, audit trails, compliance
- **Financial services**: SOC2 compliance, data governance, audit logs
- **Healthcare analytics**: HIPAA-adjacent features, secure data handling
- **Mid-size consulting firm** (20-100 analysts): Serving enterprise clients
- **Enterprise internal analytics**: Compliance, governance, fine-grained RBAC

### Typical Customer Profile
- Team size: 5-50+ users
- Data volume: 500 GB – several TB/month
- Requires compliance (SOC2, HIPAA, GDPR)
- Needs advanced security/governance
- Enterprise deployment model

### Typical Deal Size
- 5-10 initial users: $1,245 – $2,490/month = $15K – $30K/year
- 20 users: $4,980/month = $60K/year
- 50 users: $12,450/month = $150K/year

### Success Metric
ARPU: $2,000+/customer | Churn rate: <2%/month | Expansion revenue: 50% YoY

---

## 🔴 Tier 5: Enterprise – Custom Pricing

**Target Market:** Big 4 consulting, regulated industries (banking, pharma, government), Fortune 500

**Positioning:** White-glove service for organizations with unique requirements

### Specifications
| Feature | Value |
|---------|-------|
| Storage | Custom (TB scale) |
| AI Messages/month | Custom limits (controlled policy) |
| Deployment | On-premise OR VPC-isolated cloud |
| Support | 24/7 dedicated infrastructure team |

### Custom Deployment Options
- **Option 1**: Fully on-premise (your infrastructure)
- **Option 2**: VPC-isolated cloud (private cloud, AWS/GCP/Azure)
- **Option 3**: Hybrid (some components on-premise, some cloud)

### Compliance & Security
- ✅ SOC2 Type II certification support
- ✅ HIPAA Business Associate Agreement (BAA)
- ✅ GDPR compliance
- ✅ FEDRAMP (for government)
- ✅ Custom data residency requirements
- ✅ Air-gapped deployments
- ✅ Custom encryption standards

### Advanced Features
- ✅ Custom AI models/fine-tuning
- ✅ White-label branding option
- ✅ Custom API contracts/SLAs
- ✅ Volume pricing discounts (usually 20-30%)
- ✅ Multi-region deployments
- ✅ Dedicated infrastructure (not shared)
- ✅ Custom integrations (built to order)
- ✅ Priority feature development

### Support & Engagement
- **Dedicated Account Team**: Executive sponsor + technical team
- **24/7 SLA**: <15 min response for critical issues
- **Quarterly Business Reviews**: Optimization & roadmap
- **Custom training**: On-site or virtual
- **Regular security audits**: At your request

### Use Cases
- **Big 4 Consulting** (Deloitte, EY, KPMG, PwC): Serving regulated clients
- **Banking/Financial Services**: Multi-billion dollar firms
- **Pharmaceutical industry**: Clinical data handling
- **Government agencies**: Federal/municipal
- **Telcos/Utilities**: Critical infrastructure data handling
- **Large enterprises**: 1000+ employees in analytics

### Typical Customer Profile
- Revenue: $500M+
- Analytics team size: 50-500+ people
- Data volume: Multiple TB/month
- Compliance-heavy industry
- Unique technical/regulatory requirements
- Multi-year contracts

### Typical Deal Structure
- **Minimum commitment**: $3,000-$5,000/month
- **Realistic range**: $10,000-$50,000+/month
- **Deal lifecycle**: 3-6 month sales cycle
- **Contract term**: 2-3 years (30% discount for multi-year)

### Example Deal
- **2,000 GB storage**: $2,000/month
- **20 named users at $200/month**: $4,000/month
- **Dedicated infrastructure**: $3,000/month
- **White-label module**: $2,000/month
- **24/7 support**: Included
- **Total**: ~$11,000/month = $264,000/year (or $22,000/month = $528,000/year for larger setup)

### Success Metric
Average contract value: $200K-$500K/year | Expansion: 25-40% YoY | Churn: <1%/year

---

## Pricing Summary Table

| Metric | Free | Professional | Team | Business | Enterprise |
|--------|------|--------------|------|----------|-----------|
| **Monthly Cost** | $0 | $79/user | $149/user | $249/user | Custom |
| **Best For** | Learning | Solo analysts | Small teams | Mid-enterprises | Fortune 500 |
| **Storage** | 100 MB | 10 GB | 100 GB pool | 500GB-1TB pool | Custom TB |
| **AI Messages** | 50 | 500 | Unlimited* | Unlimited* | Custom |
| **Users/Team** | Solo | Solo | 3-10 | 5-50 | 50-500+ |
| **Annual Cost (5 users)** | $0 | $4,740 | $8,940 | $14,940 | $120K-500K+ |
| **Databases** | ❌ | ✅ (4) | ✅ (8) | ✅ (10+) | ✅ Custom |
| **SSO** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Governance** | ❌ | ❌ | Basic | Advanced | Custom |
| **On-Premise** | ❌ | ❌ | ❌ | ❌ | ✅ |

*Fair usage policy / controlled compute policy

---

## Conversion Funnel & ARR Growth Model

### Typical Customer Journey
```
Free (acquisition)
    ↓
Professional ($79 × 12 = $948/year)
    ↓ (upgrade after 6-12 months)
Team ($149 × users × 12)
    ↓ (expansion as team grows)
Business ($249 × users × 12)
    ↓ (enterprise opportunity)
Enterprise (Custom)
```

### Revenue Projections (1000 customers over 3 years)

#### Year 1
- Free: 800 customers @ $0
- Professional: 150 customers @ $948/year = $142,200
- Team: 40 customers (4 users) @ $7,152/year = $286,080
- Business: 10 customers (5 users) @ $14,940/year = $149,400
- Enterprise: 0
- **Total Year 1 ARR: $577,680**

#### Year 2
- Professional: 200 customers @ $948/year = $189,600
- Team: 80 customers (5 users avg) @ $8,940/year = $715,200
- Business: 30 customers (6 users avg) @ $17,928/year = $537,840
- Enterprise: 2 customers @ $300K/year = $600,000
- **Total Year 2 ARR: $2,042,640**

#### Year 3
- Professional: 250 customers @ $948/year = $237,000
- Team: 120 customers (6 users avg) @ $10,728/year = $1,287,360
- Business: 60 customers (8 users avg) @ $23,904/year = $1,434,240
- Enterprise: 5 customers @ $300K/year = $1,500,000
- **Total Year 3 ARR: $4,458,600**

---

## Competitive Positioning

### vs Alteryx
- **Alteryx Designer**: $433/month per seat
- **DataHub Team**: $149/month per seat
- **Savings**: 66% cheaper, plus unlimited workspaces & AI

### vs Tableau
- **Tableau Creator**: $75/month per seat (visualization only)
- **DataHub Professional**: $79/month (complete ETL + viz)
- **Advantage**: DataHub includes ETL; Tableau is viz-only

### vs Thoughtspot
- **Thoughtspot (min 5 users)**: $95/user/month
- **DataHub Team**: $149/user/month
- **Advantage**: DataHub has ETL; Thoughtspot is analytics-only

### vs dbt Cloud
- **dbt Cloud**: $100-300/month (transform only)
- **DataHub Professional**: $79/month (transform + visualize + profile)
- **Advantage**: DataHub is 50% cheaper, includes UI

---

## Marketing Messaging by Tier

### Free
> "Learn data analytics for free. No credit card required."

### Professional
> "The power of Alteryx at 1/5 the cost. For consultants who want database access without the enterprise overhead."

### Team
> "Team collaboration that doesn't compromise on power. Small consulting firms & analytics teams choose DataHub Team."

### Business
> "Enterprise governance meets accessibility. Compliance, audit logs, and SSO for mid-market enterprises."

### Enterprise
> "Build your competitive advantage. Custom deployments, white-label options, and 24/7 support for Fortune 500."

---

## Implementation Strategy

### Phase 1: Update Frontend (Week 1-2)
- [ ] Update plan limit types in `UserContext.tsx`
- [ ] Update pricing cards in `HomePage.tsx`, `PlansPanel.tsx`, `LandingPanel.tsx`
- [ ] Update feature comparison in UI
- [ ] Update plan descriptions

### Phase 2: Update Backend (Week 2-3)
- [ ] Create database migration for new rate limits
- [ ] Update `users.plan` enum in Postgres
- [ ] Update API authorization checks
- [ ] Test all plan enforcement logic

### Phase 3: Testing & Launch (Week 3-4)
- [ ] QA all tier restrictions
- [ ] Test upgrade/downgrade paths
- [ ] Communication to existing customers
- [ ] Feature flag rollout (gradual)

### Phase 4: Sales Enablement (Ongoing)
- [ ] Update collateral
- [ ] Train sales team
- [ ] Create sales playbooks
- [ ] Pricing page optimization

---

## Key Metrics to Track

| Metric | Target | Current |
|--------|--------|---------|
| Free → Professional conversion (30 days) | 8% | TBD |
| Free → Professional conversion (90 days) | 15% | TBD |
| Professional → Team upgrade (6 months) | 20% | TBD |
| Professional churn rate | <6%/month | TBD |
| Team churn rate | <3%/month | TBD |
| Business churn rate | <2%/month | TBD |
| Average expansion revenue | 30% YoY | TBD |
| Customer satisfaction (NPS) | 50+ | TBD |
| Enterprise close rate | 30-40% | TBD |
| Enterprise average deal size | $300K | TBD |

