# RoofTracer Data Ethics & Usage Policy

## Overview

RoofTracer is committed to responsible data collection and usage. This platform ingests publicly available building permit data from government open data portals to provide transparency and insights into roofing permit activity across the United States.

## Data Sources

### Acceptable Sources
We only ingest data from:
1. **Public open data portals** (Socrata, ArcGIS Feature Services)
2. **Government websites** with explicit data sharing permissions
3. **Bulk data downloads** provided by jurisdictions for public use
4. **Official APIs** with published documentation and terms of service

### Prohibited Sources
We do not:
- Scrape websites that prohibit automated access
- Bypass authentication or paywalls
- Violate Terms of Service or robots.txt directives
- Access systems requiring login credentials
- Use data marked as confidential or restricted

## Ethical Safeguards

### 1. Rate Limiting
- Maximum 10 requests per minute per source (configurable)
- Exponential backoff on errors (3 retries with jitter)
- Randomized delays to prevent thundering herd effects
- Respect crawl-delay directives in robots.txt

### 2. Robots.txt Compliance
Before enabling a new source, we:
- Manually verify robots.txt allows automated access
- Respect User-agent rules and Disallow directives
- Honor Crawl-delay specifications
- If disallowed, mark source as paused and seek alternative access

### 3. Provenance & Lineage
Every ingested record includes:
- `platform`: Original data source type (socrata, arcgis)
- `url`: Link to source portal for verification
- `fetched_at`: Timestamp of data retrieval
- `fields_map`: Mapping of source fields to normalized schema
- `checksum`: Optional integrity verification

This enables:
- Audit trails for data quality issues
- Attribution to original data providers
- User verification of permit details at source

### 4. Data Minimization
We collect only:
- Permit identifiers and types
- Issue dates and statuses
- Addresses (for geolocation)
- Contractor names (public record)
- Permit values (public record)

We do **not** collect:
- Social Security Numbers
- Financial account information
- Non-public contact details
- Internal system identifiers beyond permit IDs

### 5. De-duplication & Integrity
- Fingerprint-based deduplication prevents duplicate permits
- Upserts ensure latest data without redundancy
- Checksums verify data integrity across re-ingestion cycles

## Jurisdiction Opt-Out

### For Government Agencies & Data Owners
If your jurisdiction wishes to opt out of RoofTracer's data collection:

**Contact:** [Your Contact Email/Form]

**Required Information:**
1. Jurisdiction name and state
2. Dataset endpoint or portal URL
3. Authority to request removal (government email address)
4. Reason for opt-out (optional)

**Response Time:** 5 business days

**Actions Taken:**
1. Source will be disabled and marked as "Opted Out"
2. Existing permit data will be flagged (not deleted, as it's public record)
3. Future ingestion attempts will be blocked
4. Removal will be noted in provenance records

### For Individual Permit Holders
Permit data is public record. For data corrections or privacy concerns:
1. Contact your local jurisdiction's permit office
2. Request corrections or redactions at the source
3. RoofTracer will reflect upstream changes on next sync

## Proprietary Platform Guidelines (Phase 2)

For future proprietary platform connectors (eTRAKiT, Accela, etc.):

### Before Implementation
1. Review published Terms of Service
2. Verify robots.txt allows access
3. Check for anti-automation clauses
4. Confirm data is publicly viewable without login

### If Login Required
- Do **not** attempt automated access
- Seek partnership or data-sharing agreement
- Request FOIA export if applicable
- Mark source as "Manual Access Only"

### Implementation Rules
- Use lightweight form posts/JSON endpoints only
- Avoid headless browsers unless explicitly permitted
- Throttle more aggressively (5 req/min or less)
- Cap rows per run to minimize load (500-1000 max)
- Cache responses for 24+ hours

### Prohibited Actions
- Creating fake user accounts
- Bypassing CAPTCHA or rate limits
- Reverse-engineering obfuscated APIs
- Using residential proxies to evade blocks

## Public Benefit & Transparency

### Why We Collect This Data
- **Transparency:** Public building permits should be easily accessible
- **Market insights:** Help contractors and property owners understand permit activity
- **Research:** Support urban planning and construction industry analysis
- **Compliance:** Enable monitoring of permitting trends

### Data Sharing
- RoofTracer does **not** sell permit data
- API access is free and open
- Data may be used for research with proper attribution
- Bulk exports available on request for non-commercial use

## Security & Privacy

### Data Protection
- Permits table has no PII beyond contractor names (public record)
- Database access restricted to application layer
- API does not expose raw database queries
- No user tracking or analytics on permit viewers

### Responsible Disclosure
For security vulnerabilities:
- Email: [Security Contact]
- PGP Key: [Optional]
- Response time: 48 hours

## Updates to This Policy

This policy may be updated as:
- New data sources are added
- Regulatory requirements change
- Community feedback suggests improvements

**Last Updated:** [Current Date]

**Version:** 1.0.0

## Contact

For questions about this policy:
- Email: [Contact Email]
- GitHub Issues: [Repository Link]
- Data Removal Requests: [Form/Email]

## Acknowledgments

RoofTracer is built with respect for:
- Open Data principles and initiatives
- Government transparency efforts
- Community-driven data standards (BLDS)
- Responsible web scraping practices

We are grateful to the jurisdictions that maintain open data portals and make public records accessible to all.
