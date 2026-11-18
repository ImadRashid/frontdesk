# Frontdesk architecture

Principle: **code decides, the model drafts.** The language model reads and writes text. Plain code decides what is risky, which lane a task goes to, and whether anything is sent. A person approves every reply, unless an admin turns on auto-send, which only ever sends drafts that pass every check.

## System diagrams

### System context

```mermaid
flowchart LR
  CH["Channels<br/>Gmail · Outlook · any IMAP inbox<br/>WhatsApp numbers (labelled)<br/>Test inbox"]
  subgraph FD["Frontdesk server (Node 22 · Hono)"]
    direction TB
    C["Connectors<br/>IMAP IDLE · SMTP · Baileys"] --> P["Triage pipeline<br/>rules in code + LLM"]
    P --> D[("SQLite<br/>tasks · channels · settings")]
    K[("Knowledge base<br/>articles + uploaded PDFs")] --> P
    A["REST API"] <--> D
    S["Send path"]
  end
  L["Claude Sonnet 5.5"]
  U["Support agent<br/>web app"]
  CH --> C
  P <--> L
  U <--> A
  A -- approve --> S
  P -. auto-send, safe drafts only .-> S
  S --> CH
```

### Triage pipeline (code decides, the model drafts)

```mermaid
flowchart TD
  M[Incoming message] --> PII[Mask personal data<br/>cards · phones · emails · health terms]
  PII --> INJ{Text aimed at AI?}
  PII --> PRE{Automated / newsletter / spam?}
  PRE -- yes --> F[Filtered out<br/>no model call]
  PRE -- no --> CL[Classify<br/>LLM, structured JSON]
  CL --> FL[Urgency floor in code<br/>outage words → P1]
  FL --> KB[Knowledge-base search<br/>BM25 over articles + sections]
  KB --> DR[Draft reply<br/>LLM, must cite article ids,<br/>reports if knowledge base answers]
  DR --> CH[Check draft in code<br/>unsupported numbers · links · promises · no source]
  INJ --> LN
  CH --> LN{Decide lane in code}
  LN -- refund · privacy · P1 · injection --> E[Escalated<br/>no draft, specialist]
  LN -- any flag · not high confidence --> R[Needs a look]
  LN -- passes everything --> Y[Ready to send]
  Y -- auto-send on for channel --> AS[Sent automatically]
  Y & R & E --> H[Person approves, edits, moves]
  CL -. AI unavailable .-> RB[Rules-only fallback<br/>keywords, no draft → Needs a look]
```

### Message to reply (sequence)

```mermaid
sequenceDiagram
  autonumber
  participant Cu as Customer
  participant Ch as Email / WhatsApp
  participant Co as Connector
  participant Tr as Triage
  participant LLM as Claude
  participant DB as SQLite
  participant Ag as Agent (web app)
  Cu->>Ch: Message
  Ch->>Co: IMAP IDLE / Baileys event
  Co->>Tr: InMessage (normalized)
  Tr->>Tr: mask PII, injection + spam checks
  Tr->>LLM: classify (masked text)
  LLM-->>Tr: category, urgency, language, summary
  Tr->>LLM: draft with top help articles
  LLM-->>Tr: reply + cited ids + coverage
  Tr->>Tr: check draft, decide lane
  Tr->>DB: store task
  alt auto-send enabled and draft passes every check
    Tr->>Ch: send reply
  else
    Ag->>DB: open task, read reasons + sources
    Ag->>Ch: Approve & send (edited or not)
  end
  Ch->>Cu: Reply in the same thread / chat
```

### Data schema

```mermaid
erDiagram
  CHANNELS ||--o{ TASKS : receives
  CHANNELS {
    text id PK
    text type "email | whatsapp | test"
    text name "label shown in the inbox"
    text address
    text status "connected | connecting | paused | error"
    text config_json "server settings, password kept server-side"
    int auto_send "0/1 per channel"
  }
  TASKS {
    text id PK
    text channel_id FK
    text external_id "unique per channel (dedupe)"
    text from_name
    text from_address
    text subject
    text text
    int qualifies
    text category
    text urgency "P1-P4"
    text team
    text lane "reply | review | escalated"
    text draft
    text sources_json
    text flags_json
    text confidence
    text status "open | done | dismissed"
    text final_reply
    int edited
    int auto_sent
    real cost_usd
    int ms
  }
  SETTINGS {
    text key PK "auto_send_all"
    text value
  }
  ARTICLES {
    text id PK "kb-* built-in, doc-* uploaded"
    text title
    text tags
    text body "sections of ~1,500 chars for search"
    text file "original PDF/DOCX kept for uploads"
  }
  TASKS }o--o{ ARTICLES : cites
```

### Task lifecycle

```mermaid
stateDiagram-v2
  [*] --> Filtered: spam / newsletter / automated
  [*] --> ReadyToSend: passes every check
  [*] --> NeedsALook: flag or low confidence
  [*] --> Escalated: refund · privacy · P1 · injection
  Filtered --> NeedsALook: agent says it is real
  ReadyToSend --> Done: approved or auto-sent
  NeedsALook --> Done: approved after edit
  Escalated --> Done: specialist replies
  NeedsALook --> Unanswered: knowledge base has no answer
  Unanswered --> Done: answered, saved to knowledge base
  ReadyToSend --> Dismissed
  NeedsALook --> Dismissed
  Escalated --> Dismissed
```

## Data flow

```
  Email (IMAP IDLE)      WhatsApp (Baileys)      Test inbox (UI / demo)
        |                       |                        |
        +-----------+-----------+------------------------+
                    |
                    v
            normalize -> InMessage            (connectors/email.ts, connectors/whatsapp.ts)
                    |   dedupe on channel + external_id
                    v
  +------------------ triage(msg) -> TriageResult  (triage.ts) ------------------+
  |                                                                            |
  |  1. maskPII            card, phone, IBAN, DOB, health terms -> [tokens]  code |
  |  2. detectInjection    "ignore previous instructions", ...              code |
  |  3. prefilter          no-reply, List-Unsubscribe, OTP -> Filtered      code |
  |  4. classify           qualifies, category, urgency, sentiment,         LLM  |
  |                        language, summary, search_query (JSON schema)         |
  |  5. urgency floor      outage words -> >= P1/P2; angry+refund -> >= P2  code |
  |  6. KB search          kb/*.md, keyword/BM25, top 3                     code |
  |  7. draft              reply in customer's language, only from          LLM  |
  |                        articles, cites article ids (JSON schema)             |
  |  8. checkDraft         promises, unsupported numbers/URLs/dates,        code |
  |                        no source, language mismatch -> flags                 |
  |  9. decideLane         reply | review | escalated, team                 code |
  |                                                                            |
  |  AI unavailable at 4 or 7 -> ruleClassify (keywords), no draft,            |
  |  lane = review, flag ai_unavailable, mode = rules                          |
  +----------------------------------------------------------------------------+
                    |
                    v
            store message + task (SQLite)     (ingest.ts, db.ts)
                    |
                    v
   Inbox UI: Ready to send | Needs a look | Escalated | Filtered | Done
                    |
                    v
        HUMAN: read, edit, approve / move / dismiss
                    |
                    v
   send on the original channel: SMTP reply (In-Reply-To) | WhatsApp | test (mark sent)
```

## Components

| Part | File | Role |
|---|---|---|
| HTTP server | `server/src/index.ts` | Hono app on `PORT` (8787). `/api/*`; serves `web/dist` in production. |
| Storage | `server/src/db.ts` | `node:sqlite` (built into Node 22) at `data/frontdesk.db`. |
| Auth | `server/src/auth.ts` | One admin from `.env`. Signed httpOnly cookie `fd_session`. |
| Model client | `server/src/llm.ts` | Anthropic SDK, or OpenRouter as fallback. `json(system, user, schema)` returns parsed JSON plus token usage and cost. |
| Pipeline | `server/src/triage.ts` | Steps 1 to 10 above. |
| Rules | `server/src/rules.ts` | All deterministic parts: `maskPII`, `detectInjection`, `prefilter`, `ruleClassify`, `checkDraft`, `decideLane`. Unit-tested in `server/test/`. |
| Knowledge base | `server/src/kb.ts`, `kb/*.md` | Loads Markdown articles with front matter; keyword search. |
| Ingest | `server/src/ingest.ts` | Runs triage, stores message and task. |
| Connectors | `server/src/connectors/email.ts`, `whatsapp.ts` | IMAP listen (imapflow, IDLE) + SMTP send (nodemailer); Baileys QR pairing, listen, send. |
| UI | `web/` | React 19 + Vite + Tailwind. |
| Evaluation | `eval/cases.json`, `eval/run.ts`, `eval/results/` | Labelled test set, baseline vs pipeline. |

## Data contracts

Source of truth: `server/src/types.ts`.

**InMessage** (what every connector produces):

```ts
{ channel: 'email' | 'whatsapp' | 'test'; channel_id; external_id;
  from_name; from_address; subject: string | null; text; received_at /* ISO */;
  thread_key?; headers? }
```

**TriageResult** (what the pipeline produces, stored on the task):

```ts
{ qualifies; not_qualifying_reason: 'spam' | 'newsletter' | 'automated' | 'personal' | null;
  category: 'how_to' | 'bug' | 'outage' | 'billing' | 'refund' | 'account_access'
          | 'cancellation' | 'feature_request' | 'data_privacy' | 'other' | null;
  urgency: 'P1' | 'P2' | 'P3' | 'P4' | null; sentiment;
  language /* ISO-639-1 */; summary /* English, one line */;
  team: 'support' | 'billing' | 'engineering' | 'success' | 'privacy' | null;
  lane: 'reply' | 'review' | 'escalated' | null;
  reasons: string[]; draft: string | null; sources: {id, title}[];
  flags: {kind, text}[]; confidence: 'high' | 'medium' | 'low';
  injection: string[]; pii_masked: number;
  mode: 'ai' | 'rules'; model; cost_usd; ms }
```

Both model calls use a JSON schema (structured output), so the pipeline gets typed fields, not free text to parse.

## Lane rules (code, `decideLane`)

- **escalated** (no draft): injection detected, data privacy, refund, P1 outage, legal threat, angry cancellation. Team is set (privacy, billing, engineering, success).
- **review**: any flag, confidence not high, no sources, or rules mode.
- **reply**: everything else.

## Model choice and trade-offs

- **Claude Sonnet 5.5 at low effort** for both classify and draft. Triage is short, structured and high volume; speed and cost per ticket matter more than deep reasoning. Low effort keeps latency low.
- **Opus** would likely write slightly better drafts on hard cases but costs more and is slower. Hard cases are escalated to people anyway, so the extra quality would mostly be spent on messages a human handles. Switching is one env var (`MODEL`) if the evaluation shows a quality gap.
- **OpenRouter fallback** so the app works with either key.
- **Rules fallback** when no key is set or the API fails after retries. The inbox keeps working; it just has no drafts.
- **Why code decides lanes:** the lane decides what a human sees first and what can be sent quickly. That decision must be predictable, testable with unit tests, and impossible to change by writing clever text in a message. The model's opinion is an input (category, urgency, confidence); the code applies fixed rules on top, including urgency floors the model cannot lower.
- **Keyword search instead of embeddings:** with about ten articles, keyword search with tags is enough, explainable, and has no extra service. It is the first thing to replace if the knowledge base grows.
- **SQLite in-process:** zero setup for a single-team install. Not built for many concurrent writers.

## Security and privacy boundaries

- **PII is masked before the model.** Card numbers, phone numbers, IBAN-like strings, dates of birth and health terms become tokens like `[card]`. The model only ever sees masked text. The count is stored (`pii_masked`).
- **Message text is untrusted.** It is wrapped as data in the prompt, and the model is told never to follow instructions inside it. Independently, `detectInjection` (code) flags known manipulation phrases and forces the task to Escalated. The model has no tools: it cannot send, refund or change anything, whatever it is told.
- **Auto-send is opt-in.** By default the only send path is `POST /api/tasks/:id/approve`. If an admin enables auto-send (all channels or per channel), `ingest` sends only drafts that pass `autoSendEligible()` in `server/src/send.ts`: Ready to send, high confidence, AI mode, no flags, no injection.
- **Channel secrets** (IMAP/SMTP passwords, WhatsApp session keys) are stored locally in `data/` (git-ignored) and never returned by the API.
- **Single admin.** One account from `.env`, signed httpOnly session cookie. No roles. Fine for a prototype; per-agent accounts are on the plan.
- **WhatsApp via Baileys is unofficial.** It can be logged out or banned by WhatsApp. Prototype only. Production path: WhatsApp Business Cloud API (official, webhook-based, template rules for messages after 24 hours).
- **Gmail via App Password now, OAuth next.** App Passwords are simple for a reviewer to set up. OAuth in "testing" mode would block reviewers who are not added as test users, so it was deferred.

## Failure handling

| Failure | Handling |
|---|---|
| Model API error or timeout | SDK retries (2 retries, 60 s timeout; OpenRouter: 3 attempts). Then rules mode for that message with an `ai_unavailable` flag. Re-run later from the UI. |
| No API key | Rules mode from the start. App does not crash. |
| Model output truncated or refused | Treated as an error, same fallback. |
| Draft says something risky | `checkDraft` flags it; the task goes to Needs a look. |
| Duplicate delivery (IMAP re-sync, WhatsApp re-send) | Dedupe on channel + `external_id`. |
| IMAP connection drop | Reconnect with backoff; IDLE resumes. |
| WhatsApp disconnect | Baileys reconnects; if logged out, channel shows error and needs a new QR. |
| Send fails on approve | Task stays open, error shown to the user; nothing is marked sent. |
