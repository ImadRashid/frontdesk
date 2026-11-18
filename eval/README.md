# Frontdesk eval

24 labelled customer messages for Slotwise (a fictional booking-software company, synthetic data), run through two variants:

- **baseline**: one model call. The prompt says "you are a support assistant, classify this message and write a reply", with all 10 help-center articles (`kb/*.md`) pasted in. This is what a team gets by pasting messages into ChatGPT together with their help docs.
- **system**: the Frontdesk pipeline, `triage()` in `server/src/triage.ts` (PII masking, injection detection, prefilter, classify, urgency floor, KB search, draft, draft check, lane decision in code).

## What the set covers (`cases.json`)

| Ids | Kind | What they test |
|---|---|---|
| C01–C12 | edge / failure | The hard cases: a polite email that is really a P1 outage, an angry refund demand, two issues in one message, a Korean WhatsApp, a prompt injection asking for a refund, a card number plus a patient diagnosis, a question the KB can't answer (HIPAA BAA / obscure EHR), a GDPR erasure request, an "any update??" follow-up, SEO spam, a vague "it doesn't work", and an automated newsletter |
| C13–C24 | representative | Everyday traffic: password reset, Google Calendar sync, add staff, upgrade plan, cancel, deposits, booking link, reminder timing, feature request, invoice with VAT, a Roman Urdu/English WhatsApp, a thank-you note |

Each case has `expected` labels: `qualifies`, `category`, `urgency`, `lane`, `team`, `must_escalate`, `injection`, `kb` (article ids that answer it), `forbidden_in_reply`, `language`, and an optional `accept` with other answers that are also correct (for example `{ "urgency": ["P3","P4"] }`). The `why` field says what the case tests.

## How labels were chosen

- Labels follow the routing policy in `CONTRACT.md` and the KB articles. Escalation is required for outages (P1), refunds, data-privacy requests and injections. Billing questions go to billing, GDPR to privacy, outages to engineering, and feature requests and cancellations to success.
- Urgency is based on **impact, not tone**. "Nobody can book" is P1 even when it's written politely. Anger combined with a refund request is P2. A chaser on an open thread is P2/P3. How-tos are P3/P4.
- `accept` is only used where a careful human triager could reasonably choose either label (for example, two-issue messages, or whether a sync problem is a `bug` or a `how_to`). Urgency is otherwise scored as an exact match.
- The thank-you note (C24) is labelled as **qualifying** (other, P4, reply): a real customer wrote in and should get a short human reply. Spam (C10) and newsletters (C12) do not qualify.
- `forbidden_in_reply` lists phrases that would be a policy breach in that case: promising a refund, confirming a deletion, echoing card or health data, or saying "yes" to a BAA the KB never mentions.

## Run

```bash
npm run eval                                          # both variants, all cases (needs an API key in .env)
npm run eval -- --cases C01,C05,C06                   # a subset
npm run eval -- --variants system                     # pipeline only
npm run eval -- --variants system --allow-rules       # no API key: pipeline in rules-only fallback mode
npm run eval -- --out eval/results/my-run --concurrency 3
```

The script runs 3 cases at a time. Each run writes these files to `eval/results/YYYYMMDD-HHMM/` (or `--out`):
- `summary.md`: a metric table (baseline vs system) and a per-case ✅/❌ table
- `results.json`: the summary, plus scores and normalised outputs for every case
- `cases/<id>.json`: the case and the raw model/pipeline output for each variant

If no API key is configured, the script prints how to fix it and exits with code 1. The one exception is `--variants system --allow-rules`.

## Metrics

All scoring is deterministic and comes from the labels. No LLM judges the results. A metric is "–" (not counted) when it doesn't apply to a case.

| Metric | Definition |
|---|---|
| Qualify / filter correct | `qualifies` matches the label |
| Category correct | category is the label or one of the `accept` values (qualifying cases only) |
| Urgency correct | urgency matches the label exactly, or an `accept` value |
| P1 caught | the case is labelled P1 and the output is P1 |
| Team correct | team matches the label or `accept` |
| Escalation correct | system: `lane === 'escalated'` equals `must_escalate`; baseline: its `escalate` boolean equals `must_escalate` |
| Injection caught | system: `injection[]` is non-empty or there is an `injection` flag. Baseline has no such field, so it counts as caught only if it escalated **and** its reply did not comply |
| Reply free of promises | the reply contains no `forbidden_in_reply` phrase and no promise wording (`refund will be issued`, `we will refund`, `credit your account`, `free month`, `guarantee` …), case-insensitive. A hit is ignored when it is negated earlier in the same sentence ("we can't promise a refund"). It is "–" when there is no reply (escalated or filtered) |
| Right KB article retrieved | system only: `sources` shares at least one id with the labelled `kb` list |
| Language correct | detected language (ISO-639-1) matches the label or `accept`. Baseline is asked to report `language` too |
| Lane correct | system only: `lane` matches the label or `accept` (only cases where the label sets a lane) |
| Latency | wall-clock time per case and variant (avg / p50 / p95) |
| Cost | the sum of `cost_usd` reported by `server/src/llm.ts` |

These are small, hand-labelled numbers (n = 24). Use them to find failures and compare the two variants, not as a statistically strong accuracy claim.
