# XentraERP — Inbuilt AI Agent Framework

**Implementation blueprint for two governed AI agents: Master Auto-Fill and Transaction Validation.**

> **Golden rule (non-negotiable):** the AI never saves or submits. Default flow is **AI Suggests → User Reviews → User Approves → System Saves.** Direct AI write is possible *only* when an admin explicitly enables it per agent/doctype, and even then it is audited and reversible.

---

## 1. Executive Summary

Two agents sit on top of the existing metadata engine (which already knows every DocType's fields, defaults, links, and validation rules) and the ERPNext backend (which is the authoritative rule/ledger engine):

- **Master Auto-Fill Agent** — for creating master records (Customer, Item, Supplier, Account…). It asks a few guided questions, infers the rest, auto-fills defaults, generates system codes, validates mandatory fields, and presents a **review summary** the user approves before saving.
- **Transaction Validation Agent** — for draft transactions (Sales Order, Invoice, Payment…). It reviews the draft, detects mistakes and missing/incorrect values, **explains** each issue in plain language, **recommends** a fix, and applies fixes **only per-item, on user approval.**

The framework is **deterministic-first**: a rule engine + metadata provides the guarantees (mandatory checks, code generation, cross-field validation) with no LLM required. An **optional LLM layer** (Claude, server-side) adds natural-language understanding, guided questions, and human-readable explanations. If no LLM key is configured, the agents degrade gracefully to the deterministic core.

---

## 2. Functional Requirements

**Master Auto-Fill Agent**
- FR-M1 Accept a natural-language intent ("new cash customer in Bahrain") or a target DocType.
- FR-M2 Ask the minimum set of guided questions to resolve mandatory + high-value fields.
- FR-M3 Auto-fill defaults from company config, metadata `default`, and learned patterns.
- FR-M4 Generate system codes (item_code, customer id, etc.) per configurable naming rules.
- FR-M5 Validate all mandatory + conditional-mandatory fields before review.
- FR-M6 Produce a **review summary** (field → value, source: asked/default/generated/inferred).
- FR-M7 Save only on explicit user approval; never auto-save unless admin-enabled.

**Transaction Validation Agent**
- FR-T1 Load a draft transaction and run the rule engine + metadata validation.
- FR-T2 Detect: missing mandatory, out-of-range, broken links, tax/price mismatches, duplicate, credit-limit, date/fiscal issues, arithmetic inconsistencies.
- FR-T3 For each issue: severity, plain-language explanation, recommended fix (old → new).
- FR-T4 Apply a fix only when the user approves that specific fix.
- FR-T5 Re-validate after fixes; allow save only when blocking issues are cleared.
- FR-T6 Never submit; submission remains a human/workflow action.

**Cross-cutting**
- FR-X1 Every suggestion, approval, rejection, and applied change is audit-logged.
- FR-X2 Admin controls: enable/disable each agent, per-doctype scope, auto-save allowance (default off), LLM on/off, confidence threshold.
- FR-X3 Role-gated: only permitted roles can use agents or change AI settings.
- FR-X4 All AI writes go through the same ERPNext permission + validation as manual writes.

---

## 3. Architecture

```
User ── AI Assistant panel (frontend) ──► /api/ai (BFF)
                                              │
                 ┌────────────────────────────┼───────────────────────────┐
                 ▼                            ▼                            ▼
        Rule Engine (deterministic)   Metadata (get_meta)         LLM layer (optional, Claude)
        - mandatory / conditional     - fields, defaults,          - guided questions
        - cross-field rules           - links, options             - NL intent → fields
        - code generation             - naming series              - explanations
                 └───────────────► Suggestion set (never applied) ◄─┘
                                              │
                              User reviews & approves (frontend)
                                              │
                                    ERPNext REST (createDoc/updateDoc)
                                              │
                                        Audit log (Xentra AI Audit)
```

The LLM is **advisory only** — it proposes field values and explanations; the deterministic engine and ERPNext enforce correctness. The LLM never receives write access.

---

## 4. Database Schema (control-plane DocTypes / tables)

Stored as ERPNext custom DocTypes (surrogate IDs as PKs, matching the existing SaaS control plane).

- **Xentra AI Settings** (Single) — `enabled` (Check), `master_agent_enabled`, `txn_agent_enabled`, `allow_auto_save` (Check, default 0), `llm_enabled` (Check, default 0), `llm_provider` (Select: Claude), `confidence_threshold` (Float 0-1), `allowed_roles` (Small Text/Table), `scoped_doctypes` (Small Text).
- **Xentra AI Suggestion** — `id` (XAIS-#####), `agent` (Select: Master/Transaction), `doctype`, `docname` (nullable for new), `payload_json` (Long Text: suggested fields), `issues_json` (Long Text), `status` (Select: Proposed/Approved/Rejected/Applied/Discarded), `confidence` (Float), `created_by`, `reviewed_by`, `source` (rules/llm/hybrid).
- **Xentra AI Audit** — `id` (XAIA-#####), `suggestion` (Link), `action` (Select: Suggested/Approved/Rejected/Applied/AutoSaved), `field`, `old_value`, `new_value`, `user`, `role`, `timestamp`, `ip`.
- **Xentra Naming Rule** — `id`, `doctype`, `field`, `pattern` (e.g. `CUST-.YYYY.-.#####`), `active`, `scope` (company/global).
- **Xentra Validation Rule** — `id`, `doctype`, `name`, `expression` (JSON rule), `severity` (Block/Warn/Info), `message`, `fix_expression` (JSON, optional), `active`.

FKs: Suggestion 1—* Audit; Suggestion → doctype/docname; Validation/Naming Rule → doctype. Everything tenant-scoped by company/site.

---

## 5. Backend / BFF API Design

All under `/api/ai/*`, server-side, tenant-aware, permission-checked. Never expose the LLM key to the browser.

| Endpoint | Purpose | Request | Response |
|---|---|---|---|
| `POST /api/ai/master/plan` | Start master auto-fill | `{doctype, intent?, answers?}` | `{questions[], fields{}, generated{}, missing[], summary[], confidence}` |
| `POST /api/ai/master/validate` | Validate a proposed master | `{doctype, fields}` | `{ok, issues[]}` |
| `POST /api/ai/txn/review` | Validate a draft transaction | `{doctype, doc}` | `{issues[], score}` where issue = `{field, severity, message, current, suggested, ruleId}` |
| `POST /api/ai/apply` | Record approval + return the doc to save (does NOT save) | `{suggestionId, approvedFixes[]}` | `{doc, remainingIssues[]}` |
| `POST /api/ai/settings` | Read/update AI settings (admin) | settings | settings |
| `GET  /api/ai/audit` | List AI audit trail | filters | rows |

**Auth:** each call carries the tenant + user; the BFF checks `Xentra AI Settings.allowed_roles` and the user's ERPNext roles. `apply` returns the doc for the **frontend** to POST via the normal REST path (so ERPNext perms/validation apply); the BFF writes only when `allow_auto_save` is on.

**Error handling:** LLM failure → fall back to deterministic result with `source: rules`. Rule-engine error → return the issue, never block silently. Timeouts → return partial deterministic result.

---

## 6. AI Prompt Templates (LLM layer, Claude)

System prompt (shared):
> You are XentraERP's data assistant. You propose field values and explanations for ERP records. You NEVER save or submit. You must respect the provided DocType metadata (mandatory, options, links). Output strict JSON matching the given schema. If unsure, ask a concise question instead of guessing. Do not invent link values that aren't in the provided options.

**Master Auto-Fill prompt:**
```
DocType: {{doctype}}
Metadata (fields, mandatory, options, links, defaults): {{meta_json}}
Company context: {{company, currency, country}}
User intent: {{intent}}
Known answers: {{answers}}
Task: (1) list any still-needed guided questions (max 5, only for mandatory/high-value gaps);
(2) propose values for fields you can infer, tagging each source as asked|default|generated|inferred;
(3) do NOT fill fields you cannot justify. Return JSON: {questions[],fields{fieldname:{value,source,confidence}}}
```

**Transaction Validation prompt:**
```
DocType: {{doctype}}
Metadata + active validation rules: {{meta_json}} {{rules_json}}
Draft document: {{doc_json}}
Task: identify issues (missing mandatory, wrong/implausible values, mismatched totals, broken links,
policy breaches). For each: {field, severity(Block|Warn|Info), message(plain English), current, suggested, why}.
Only suggest fixes that are safe and justified. Return JSON: {issues:[...]}. Do not modify the doc.
```

Guardrails: JSON-schema-validate every LLM response; drop any field not in metadata; drop any Link value not in the allowed set; clamp to `confidence_threshold`.

---

## 7. Validation Rule Engine

Deterministic, runs before/with the LLM. Rule types:
- **Mandatory / conditional-mandatory** — from metadata `reqd` / `mandatory_depends_on`.
- **Type/format** — numeric, date, precision, regex.
- **Options/link existence** — Select in options; Link target exists.
- **Cross-field** — JSON expressions over the doc (`{field:'grand_total', op:'==', expr:'sum(items.amount)+sum(taxes.tax_amount)'}`).
- **Policy** — credit limit, negative stock, posting date within fiscal year, duplicate detection.
Each rule: `{id, doctype, severity, when(optional), assert, message, fix(optional)}`. The engine returns issues; `fix` produces a suggested value but is applied only on approval. Rules are data (`Xentra Validation Rule`), editable by admins, versioned.

---

## 8. Auto-Code Generation Logic

Driven by `Xentra Naming Rule` (falls back to ERPNext naming series when present):
- Pattern tokens: `.YYYY.`, `.MM.`, `.#####` (zero-padded counter), literal prefixes, `{abbr}`, `{field:x}`.
- Generation: resolve tokens → query the last used counter (per pattern/company) → increment atomically → format. E.g. `CUST-.YYYY.-.#####` → `CUST-2026-00042`.
- Uniqueness: check candidate against the target DocType; retry on collision. For ERPNext-managed naming, defer to the server (don't pre-generate) to avoid clashes.

---

## 9. Frontend UI Design

- **AI Assistant panel** — a slide-over launched from a form's "AI Assist" button. Two modes auto-selected by context (new master vs draft transaction).
  - *Master mode*: chat-style guided questions → live "Review Summary" table (Field · Value · Source badge) → **Approve & Fill** (fills the form; user still clicks Save) or **Approve & Save** (only if admin-enabled).
  - *Transaction mode*: issue list with severity chips (Block=red, Warn=amber, Info=blue), each with explanation, current→suggested, and an **Apply fix** checkbox. Footer: **Apply selected**, then normal Save/Submit.
- **AI settings screen** (admin) — toggles for each agent, auto-save allowance (with a prominent warning), LLM on/off + provider, confidence threshold, allowed roles, scoped doctypes.
- **Audit view** — filterable table of AI actions.
- Visual language reuses the app's cards/badges; AI suggestions are visually distinct (subtle accent) and always show "AI suggestion — review before saving."

---

## 10. Role Permissions

- `AI User` — may invoke agents on doctypes they already have create/write permission for.
- `AI Reviewer` — may approve/apply AI fixes.
- `AI Admin` — may change `Xentra AI Settings`, rules, naming rules, and (if ever) enable auto-save.
- Enforcement: agents never exceed the user's ERPNext permissions; the BFF re-checks; ERPNext enforces on the final write. Auto-save requires BOTH `allow_auto_save` on AND the user holding write/submit perms.

---

## 11. Audit Logging

Every step writes `Xentra AI Audit`: who, when, which suggestion, action (Suggested/Approved/Rejected/Applied/AutoSaved), field-level old→new, source (rules/llm), confidence, IP. Immutable, exportable, filterable. Auto-saves are flagged and reviewable; a "revert" links back to the pre-change values captured in the audit row.

---

## 12. Testing Scenarios

- Master: intent "cash customer Bahrain" → agent asks only for name; fills group/territory/currency=BHD; generates code; review summary correct; save only on approve.
- Master: mandatory field the agent can't infer → it asks, doesn't guess.
- Master: LLM proposes an invalid Item Group → dropped by guardrail; user prompted.
- Txn: Sales Order with grand_total ≠ sum(items) → Block issue, suggested corrected total, applied on approval, re-validate clears it.
- Txn: currency mismatch / missing conversion_rate → Warn + suggested live rate.
- Txn: credit-limit breach → Block with explanation; no auto-fix.
- Governance: `allow_auto_save` off → "Approve & Save" hidden; AI cannot write.
- Governance: user without write perm → agent read-only suggestions; write blocked by ERPNext.
- Audit: every suggestion/approval/apply recorded with old→new.
- Degradation: LLM key absent → deterministic suggestions still work.
- Security: LLM response with script/HTML in a message → sanitized; JSON-schema-validated.

## 13. Deployment Steps

1. Provision AI control-plane DocTypes (Settings, Suggestion, Audit, Naming Rule, Validation Rule) via the existing self-provisioning mechanism.
2. Set server env: `ANTHROPIC_API_KEY` (optional), `AI_MODEL` (e.g. latest Claude), `AI_ENABLED`. No key → deterministic mode.
3. Deploy the `/api/ai/*` routes + AI Assistant panel + admin settings screen.
4. Seed default validation + naming rules per doctype.
5. Configure `Xentra AI Settings` (agents on, auto-save OFF, allowed roles).
6. Smoke-test the suggest→approve→save flow on one master + one transaction.

## 14. Phased Rollout Plan

- **Phase 0 — Deterministic MVP (now):** rule engine + metadata auto-fill + code-gen + AI Assistant panel + admin gate + audit. No LLM. Suggest→review→approve→save.
- **Phase 1 — LLM enhancement:** add the Claude-backed `/api/ai` layer for guided questions + explanations, JSON-guardrailed, confidence-gated. Still no auto-save.
- **Phase 2 — Rule authoring UI + more doctypes:** admins author validation/naming rules; expand agent coverage across masters and transactions.
- **Phase 3 — Learning + opt-in auto-save:** pattern learning from history; per-doctype opt-in auto-save for low-risk masters, fully audited and revertible.
- **Phase 4 — Proactive assist:** inline suggestions as the user types; anomaly detection across transactions.

---

## Appendix A — Suggestion JSON (contract)

```json
{
  "suggestionId": "XAIS-00042",
  "agent": "Master",
  "doctype": "Customer",
  "confidence": 0.86,
  "source": "hybrid",
  "questions": [{ "field": "customer_name", "text": "What is the customer's name?" }],
  "fields": {
    "customer_group": { "value": "Commercial", "source": "default", "confidence": 1 },
    "territory": { "value": "Bahrain", "source": "inferred", "confidence": 0.9 },
    "default_currency": { "value": "BHD", "source": "inferred", "confidence": 0.95 },
    "customer_id": { "value": "CUST-2026-00042", "source": "generated", "confidence": 1 }
  },
  "summary": [
    { "field": "Customer Group", "value": "Commercial", "source": "default" }
  ]
}
```

## Appendix B — Issue JSON (transaction agent)

```json
{
  "issues": [
    { "field": "grand_total", "severity": "Block", "ruleId": "so-total-consistency",
      "message": "Grand total 1,050.000 doesn't match items + tax (1,102.500).",
      "current": 1050.0, "suggested": 1102.5, "fixable": true },
    { "field": "conversion_rate", "severity": "Warn", "ruleId": "fx-missing",
      "message": "Transaction currency USD differs from company BHD; exchange rate looks stale.",
      "current": 1, "suggested": 0.376, "fixable": true }
  ],
  "score": 0.72
}
```
