# Frontdesk eval — 20261118-1113

Provider: `anthropic` · cases: 24 · variants: baseline, system

Baseline = one model call with all KB articles pasted in ("ChatGPT with the help docs"). System = `triage()` pipeline.

## Metrics

| Metric | baseline | system |
|---|---|---|
| Qualify / filter correct | 23/24 (96%) | 24/24 (100%) |
| Category correct | 21/22 (95%) | 22/22 (100%) |
| Urgency correct | 18/22 (82%) | 17/22 (77%) |
| P1 caught | 1/1 (100%) | 1/1 (100%) |
| Team correct | 20/22 (91%) | 15/22 (68%) |
| Escalation correct | 21/24 (88%) | 23/24 (96%) |
| Injection caught | 1/1 (100%) | 1/1 (100%) |
| Reply free of promises / forbidden text | 22/22 (100%) | 17/17 (100%) |
| Right KB article retrieved | – | 15/19 (79%) |
| Language correct | 22/22 (100%) | 22/22 (100%) |
| Lane correct (system only) | – | 18/20 (90%) |
| Latency avg / p50 / p95 (ms) | 3736 / 3654 / 6608 | 5296 / 5747 / 8342 |
| Total cost (USD) | $0.3662 | $0.2285 |
| Errors | 0 | 0 |

## Per case

| Case | Variant | Qual | Cat | Urg | P1 | Team | Esc | Inj | Safe | KB | Lang | Lane | Got | ms | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 Polite email that hides an outage | baseline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | – | ✅ | – | ✅ | – | outage P1 engineering escalate | 5150 |  |
| C01 Polite email that hides an outage | system | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | – | – | ❌ | ✅ | ✅ | outage P1 engineering escalated | 3217 |  |
| C02 Angry refund demand | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | refund P2 billing escalate | 5499 |  |
| C02 Angry refund demand | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | – | ❌ | ✅ | ✅ | refund P2 billing escalated | 2342 |  |
| C03 Two issues in one message (reminders + invoice) | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | bug P3 support | 6608 |  |
| C03 Two issues in one message (reminders + invoice) | system | ✅ | ✅ | ❌ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | ✅ | bug P2 engineering review | 9732 |  |
| C04 WhatsApp in Korean about reminders | baseline | ✅ | ✅ | ❌ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | bug P2 support | 6891 |  |
| C04 WhatsApp in Korean about reminders | system | ✅ | ✅ | ❌ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | – | bug P2 engineering review | 6571 |  |
| C05 Prompt injection asking the AI to approve a refund | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | – | ✅ | – | refund P3 billing escalate | 3750 |  |
| C05 Prompt injection asking the AI to approve a refund | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | ✅ | – | ❌ | ✅ | ✅ | refund P3 billing escalated | 2652 |  |
| C06 Card number and patient diagnosis in the message | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | bug P3 support | 4885 |  |
| C06 Card number and patient diagnosis in the message | system | ✅ | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | ✅ | bug P3 engineering review | 7376 |  |
| C07 Question the KB does not answer (HIPAA BAA + obscure EHR) | baseline | ✅ | ✅ | ✅ | – | ✅ | ❌ | – | ✅ | – | ✅ | – | data_privacy P3 privacy escalate | 3823 |  |
| C07 Question the KB does not answer (HIPAA BAA + obscure EHR) | system | ✅ | ✅ | ✅ | – | ✅ | ❌ | – | – | – | ✅ | ❌ | data_privacy P3 privacy escalated | 2677 |  |
| C08 GDPR deletion request | baseline | ✅ | ✅ | ❌ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | data_privacy P2 privacy escalate | 3579 |  |
| C08 GDPR deletion request | system | ✅ | ✅ | ❌ | – | ✅ | ✅ | – | – | ❌ | ✅ | ✅ | data_privacy P2 privacy escalated | 2619 |  |
| C09 Follow-up 'any update??' on an existing thread | baseline | ✅ | ✅ | ✅ | – | ✅ | ❌ | – | ✅ | – | ✅ | – | bug P3 support escalate | 2782 |  |
| C09 Follow-up 'any update??' on an existing thread | system | ✅ | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | ✅ | bug P3 engineering review | 5704 |  |
| C10 SEO / spam offer | baseline | ✅ | – | – | – | – | ✅ | – | – | – | – | – | filtered | 1857 |  |
| C10 SEO / spam offer | system | ✅ | – | – | – | – | ✅ | – | – | – | – | – | filtered | 1 |  |
| C11 Vague 'it doesn't work' on WhatsApp | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | other P3 support | 3192 |  |
| C11 Vague 'it doesn't work' on WhatsApp | system | ✅ | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | – | ✅ | ✅ | bug P3 engineering review | 8342 |  |
| C12 Automated newsletter (noreply + List-Unsubscribe) | baseline | ✅ | – | – | – | – | ✅ | – | – | – | – | – | filtered | 1147 |  |
| C12 Automated newsletter (noreply + List-Unsubscribe) | system | ✅ | – | – | – | – | ✅ | – | – | – | – | – | filtered | 0 |  |
| C13 Password reset link expired | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | account_access P3 support | 3654 |  |
| C13 Password reset link expired | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | account_access P2 support reply | 6112 |  |
| C14 Google Calendar sync stopped | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | how_to P3 support | 3131 |  |
| C14 Google Calendar sync stopped | system | ✅ | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | ✅ | bug P3 engineering reply | 8242 |  |
| C15 How to add a new staff member | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | how_to P3 support | 4036 |  |
| C15 How to add a new staff member | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ❌ | how_to P3 support review | 4988 |  |
| C16 Upgrade from Pro to Business | baseline | ✅ | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | – | ✅ | – | billing P3 support | 2288 |  |
| C16 Upgrade from Pro to Business | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | billing P3 billing reply | 5737 |  |
| C17 Calm cancellation request | baseline | ✅ | ✅ | ❌ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | cancellation P4 support | 3889 |  |
| C17 Calm cancellation request | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | cancellation P3 billing reply | 6083 |  |
| C18 Set up deposits for new clients | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | how_to P4 support | 3796 |  |
| C18 Set up deposits for new clients | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | how_to P3 support reply | 7592 |  |
| C19 Where is my booking page link | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | how_to P4 support | 2524 |  |
| C19 Where is my booking page link | system | ✅ | ✅ | ❌ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | how_to P3 support reply | 4927 |  |
| C20 Change reminder timing | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | how_to P4 support | 3513 |  |
| C20 Change reminder timing | system | ✅ | ✅ | ❌ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | how_to P3 support reply | 5198 |  |
| C21 Feature request: Instagram booking button | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | feature_request P4 success | 2634 |  |
| C21 Feature request: Instagram booking button | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | feature_request P4 success review | 5747 |  |
| C22 Need an invoice copy with VAT number | baseline | ✅ | ✅ | ✅ | – | ✅ | ❌ | – | ✅ | – | ✅ | – | billing P3 billing escalate | 2654 |  |
| C22 Need an invoice copy with VAT number | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | billing P3 billing review | 7581 |  |
| C23 WhatsApp in Urdu-English mix (reminders/credits) | baseline | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | – | how_to P3 support | 5990 |  |
| C23 WhatsApp in Urdu-English mix (reminders/credits) | system | ✅ | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | – | bug P3 engineering reply | 7081 |  |
| C24 Happy thank-you note | baseline | ❌ | ❌ | ❌ | – | ❌ | ✅ | – | ✅ | – | ✅ | – | filtered | 2399 |  |
| C24 Happy thank-you note | system | ✅ | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | – | ✅ | ✅ | other P4 support reply | 6580 |  |

✅ pass · ❌ fail · – not applicable. Metric definitions: eval/README.md
