# Frontdesk — build contract (shared by all builders)

Product: **Frontdesk** — one inbox for every customer message. It listens to email (IMAP/SMTP, Gmail via
App Password) and WhatsApp (Baileys QR session), decides which messages are real customer requests,
classifies them, drafts a reply grounded in the help center, checks the draft, and puts a **task** in a
human queue. Nothing is sent without a person approving it.

Fictional business (synthetic data, stated openly): **Slotwise**, appointment-booking software for small
clinics and salons (online booking page, SMS/WhatsApp reminders, payments/deposits, staff calendars,
Google Calendar sync). Plans: Starter $29/mo, Pro $79/mo, Business $199/mo. Support team: support,
billing, engineering, success, privacy.

## Layout (root = frontdesk/)
```
package.json            one package for server + web (npm workspaces NOT used)
.env.example            ANTHROPIC_API_KEY, OPENROUTER_API_KEY, MODEL, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET, PORT
server/src/index.ts     Hono app on PORT (default 8787); serves /api/*; in production serves web/dist
server/src/db.ts        node:sqlite (built into Node 22) at data/frontdesk.db
server/src/auth.ts      single admin from .env; signed httpOnly cookie "fd_session"
server/src/llm.ts       Anthropic SDK (preferred) or OpenRouter (fallback); json(system,user,schema) -> {data, usage}
server/src/triage.ts    the pipeline (below); export async function triage(msg: InMessage): Promise<TriageResult>
server/src/rules.ts     deterministic parts: maskPII, detectInjection, prefilter (automated/newsletter), ruleClassify (fallback), checkDraft, decideLane
server/src/kb.ts        loads kb/*.md (front matter: id, title, tags); search(query, k=3) keyword/BM25
server/src/ingest.ts    ingest(msg: InMessage): run triage, store message + task, return task
server/src/connectors/email.ts     IMAP (imapflow, IDLE) listen + SMTP (nodemailer) send
server/src/connectors/whatsapp.ts  Baileys: QR -> data URL, listen messages.upsert, send replies
web/                    React 19 + Vite + Tailwind v4 (vite root = web/, proxy /api -> 8787)
kb/*.md                 Slotwise help-center articles
eval/cases.json         labelled test messages; eval/run.ts baseline vs pipeline; eval/results/
docs/                   README is at root; docs/ARCHITECTURE.md, RUNBOOK.md, EVALUATION.md, CASE_STUDY.md, AI_COLLABORATION.md
```
Run: `npm install`, `npm run dev` (server on 8787 + vite on 5180), open http://localhost:5180.

## Types (server/src/types.ts)
```ts
export type ChannelType = 'email' | 'whatsapp' | 'test'
export type InMessage = {
  channel: ChannelType; channel_id: string; external_id: string
  from_name: string; from_address: string            // email address or WhatsApp number/jid
  subject: string | null; text: string; received_at: string  // ISO
  thread_key?: string | null; headers?: Record<string, string>
}
export type Category = 'how_to' | 'bug' | 'outage' | 'billing' | 'refund' | 'account_access' | 'cancellation'
  | 'feature_request' | 'data_privacy' | 'other'
export type NonQualifying = 'spam' | 'newsletter' | 'automated' | 'personal'
export type Urgency = 'P1' | 'P2' | 'P3' | 'P4'
export type Lane = 'reply' | 'review' | 'escalated'          // reply = ready to approve; review = needs a look; escalated = specialist/human only
export type Team = 'support' | 'billing' | 'engineering' | 'success' | 'privacy'
export type Flag = { kind: 'injection' | 'pii' | 'promise' | 'unsupported_fact' | 'no_source' | 'language' | 'policy' | 'low_confidence' | 'ai_unavailable'; text: string }
export type TriageResult = {
  qualifies: boolean; not_qualifying_reason: NonQualifying | null
  category: Category | null; urgency: Urgency | null; sentiment: 'angry' | 'negative' | 'neutral' | 'positive'
  language: string                    // ISO-639-1, e.g. 'en', 'ko', 'ur'
  summary: string                     // one line, English
  team: Team | null; lane: Lane | null
  reasons: string[]                   // why this lane/urgency, short, human-readable
  draft: string | null                // reply in the customer's language; null when lane=escalated or AI unavailable
  sources: { id: string; title: string }[]
  flags: Flag[]
  confidence: 'high' | 'medium' | 'low'
  injection: string[]; pii_masked: number
  mode: 'ai' | 'rules'; model: string; cost_usd: number; ms: number
}
```

## Pipeline (code decides, the model drafts)
1. maskPII(text): card numbers, emails (except sender), phone numbers, IBAN-like, dates of birth, health terms
   are replaced with tokens like [card], [phone]; count -> pii_masked. Only masked text goes to the model.
2. detectInjection(text): regex list ("ignore previous instructions", "you are an AI", "system prompt",
   "approve a refund", "as the assistant you must" ...). Hits -> flags + lane escalated.
3. prefilter: no-reply/mailer-daemon senders, List-Unsubscribe header, OTP/verification-code texts ->
   qualifies=false (automated/newsletter) without calling the model.
4. classify (LLM, structured JSON): qualifies, not_qualifying_reason, category, urgency, sentiment,
   language, summary, search_query (English), needs_human (bool + reason).
5. urgency floor in code: outage words ("down", "can't log in" + "all"/"everyone", "not loading", "500",
   "patients can't book") -> at least P1/P2; angry + refund -> P2.
6. kb.search(search_query) top 3.
7. draft (LLM, structured JSON {reply, used_article_ids[], confidence}) — reply only from the articles,
   in the customer's language, no promises of refunds/credits/dates/features, no invented links or prices.
8. checkDraft (code): unsupported numbers/prices/URLs/dates not present in articles or message;
   promise words (refund, credit, free month, compensate, guarantee, by tomorrow) -> 'promise' flag;
   no used articles -> 'no_source'; language mismatch -> 'language'.
9. decideLane (code):
   - escalated: injection, data_privacy, refund, outage P1, legal threat, angry+cancellation; team set accordingly
   - review: any flag, confidence != high, no sources, mode=rules
   - reply: otherwise
10. AI unavailable (no key / API error after retries) -> ruleClassify keywords; draft null; lane review;
    flag ai_unavailable; mode 'rules'. The app must never crash on missing key.

## HTTP API (all JSON, all under /api, all except login require the session cookie)
- POST /api/login {email,password} -> {ok:true, email}; POST /api/logout; GET /api/me -> {email} | 401
- GET  /api/tasks?view=reply|review|escalated|done|filtered|all&q=  -> {items: Task[], counts: {reply,review,escalated,done,filtered}}
- GET  /api/tasks/:id -> Task
- POST /api/tasks/:id/approve {reply: string} -> sends on the original channel (email via SMTP as a reply with In-Reply-To;
       whatsapp via Baileys; test channel just marks sent) -> Task (status 'done', sent_at)
- POST /api/tasks/:id/dismiss {reason?} ; POST /api/tasks/:id/move {lane?, team?} ; POST /api/tasks/:id/retriage
- GET  /api/channels -> Channel[] ; POST /api/channels/email {name, address, imap:{host,port,secure,user,pass}, smtp:{host,port,secure,user,pass}}
       (tests the IMAP login first; 400 {error} with a human message on failure)
- POST /api/channels/whatsapp {name} -> Channel (status 'connecting'); GET /api/channels/:id -> Channel incl. qr (data URL) while pairing
- POST /api/channels/:id/pause ; DELETE /api/channels/:id
- POST /api/simulate {from_name, from_address, subject?, text, channel_hint?: 'email'|'whatsapp'} -> Task|Message (test channel)
- POST /api/demo/load -> ingests eval/cases.json messages through the test channel (for demos)
- GET  /api/stats -> {total, qualified, filtered, by_lane, by_category, by_channel, p1_open, avg_ms, cost_usd, approved, edited_before_send, ai_mode}
- GET  /api/kb -> {id,title,tags,body}[]
- GET  /api/health -> {ok, ai: 'anthropic'|'openrouter'|'none', model}

Task (row returned to the UI) = InMessage fields + TriageResult fields + {id, status: 'open'|'done'|'dismissed',
created_at, sent_at, final_reply, edited: boolean, channel_name}.
Channel = {id, type, name, address, status: 'connected'|'connecting'|'paused'|'error', detail, last_message_at, qr?: string|null, message_count}.
The 'test' channel always exists ("Test inbox").
Secrets for channels are stored in data/ (gitignored), never returned by the API (passwords masked).
