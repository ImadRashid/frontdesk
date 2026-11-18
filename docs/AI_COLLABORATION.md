# AI collaboration note

How AI tools were used to build Frontdesk, what was checked, and which decisions the author made.

## Tools and their roles

| Tool | Role |
|---|---|
| **Claude Code with Claude Opus 5.5** | Main coding agent. Also the orchestrator: it split the build into parallel sub-agents (backend, data and evaluation, documentation) working from one shared contract (`CONTRACT.md`), while it built the web UI itself. |
| **Claude Sonnet 5.5** (inside the product) | Classifies messages and drafts replies through structured JSON output. Called from `server/src/llm.ts`. Also the model for both variants in the evaluation. |

## How the work was split

The earlier sprint days went to discovery: comparing candidate workflows and deciding what could be built, evaluated and handed off in time. Frontdesk itself was built, evaluated and deployed on the final day:

1. The author defined the product, users, channels, approval policy and non-goals; Claude Code turned that into a written contract (`CONTRACT.md`): types, pipeline steps and API.
2. Three sub-agents worked in parallel against the contract (backend, knowledge base + labelled test set + eval runner, documentation) while the main agent built the UI.
3. The eval was run, failures were investigated and fixed, and the eval was re-run (see [EVALUATION.md](EVALUATION.md)).
4. The author reviewed the running app and asked for changes, then had it deployed to their own server.

## What was delegated to AI

- Writing most of the code: server, connectors, pipeline, rules, UI, eval runner, Dockerfile.
- Writing the synthetic knowledge-base articles (`kb/*.md`) and the 24 labelled test messages (`eval/cases.json`) from the author's description of the business and ticket mix.
- First drafts of all documentation, including this note.
- Inside the product: understanding each message and drafting a reply.

## How results were verified

- **Unit tests on the deterministic rules** (`npm test`, `server/test/`): PII masking, injection detection, prefilter, draft checks, lane decisions.
- **End-to-end runs through the API** of every flow the UI uses: sign-in, test messages, demo load, approve, move, re-triage, dismiss, knowledge-base upload (PDF, Word, text) and removal, the Unanswered view.
- **Labelled evaluation:** `npm run eval`, baseline vs Frontdesk on 24 cases, run three times as fixes went in (results in [EVALUATION.md](EVALUATION.md)).
- **Reading the code** for the parts that must not be wrong: only `approve` sends anything, lanes are decided in code, secrets are never returned by the API.
- **Not yet verified live:** a real IMAP/SMTP mailbox and a real WhatsApp QR pairing. Both connectors are built and type-checked; the demo uses the test channel. This is stated as a limitation.

## Bugs found in AI-generated code, and the fixes

- **Routing rule (found by the eval).** `teamFor()` sent every bug report to engineering, so team accuracy was 68%, worse than the baseline's 91%. In this support process, support reproduces bugs first; engineering owns outages. Changed in `server/src/rules.ts`; team accuracy went to 22/22.
- **Escalated messages showed no help articles (found by the eval).** Sources came only from the draft, and escalated messages get no draft. Now the top articles are attached as reference (`server/src/triage.ts`); help-article hit went from 15/19 to 19/19.
- **Uploaded PDFs were stored empty.** The PDF text extractor takes ownership of the byte buffer it is given, so the saved original was zero bytes. Found by comparing the downloaded file with the upload; fixed by passing the extractor a copy.
- **Eval contaminated by local uploads.** Test documents uploaded during manual testing were visible to the eval run. The eval now uses only the built-in knowledge base (`FD_KB_BUILTIN_ONLY=1`), and the affected run was discarded.
- **First two deploys failed.** The platform injected `NODE_ENV=production` into the Docker build, so build tools were skipped; then the platform's health check needed `curl`, which the slim image lacks. Fixed the build stage, kept the image's own Node-based health check, and made secrets runtime-only so they are not passed into the image build.
- **Rules-mode false positives (found by the first rules-only eval run).** A thank-you note ("no-shows are down a lot") was flagged as an outage, and an SEO spam email as a refund. The outage patterns now need a service word next to "down", and the spam filter runs before the topic rules.

## Results the author rejected or corrected

- **Design direction:** the author rejected an earlier generic form-style UI as poor for a non-developer and asked for a purpose-built inbox with lanes.
- **Requested after reviewing the running app:** a home page ("you have N things that need your attention"), an **Unanswered** list for knowledge gaps with "save answer to knowledge base", PDF and Word uploads to the knowledge base that keep the original file, real brand logos, and the sign-in page no longer mentioning configuration files.
- **The "unanswered" signal:** the first version only caught drafts with no cited article. Testing showed the model would say "the knowledge base doesn't cover this" while citing a loosely related article, so the draft step now reports explicitly whether the knowledge base answered the question.
- **POP3 replaced with IMAP:** POP3 cannot listen for new mail and can delete mail from the server.
- **Gmail OAuth deferred:** an unverified OAuth app in testing mode only works for listed test users, so reviewers could not connect their own Gmail. App Passwords work today; OAuth is in the next iteration.
- **Baileys kept, but flagged:** the official WhatsApp Business API needs business verification that does not fit a sprint. Baileys is marked as unofficial and prototype-only.
- **A label kept as a failure:** for the HIPAA BAA question, both variants escalated to the privacy team while the label says "needs a look". The label was not changed to improve the score.

## Decisions the author owned

- The problem choice and the five-day scope.
- Channel scope: email and WhatsApp, plus a test channel.
- The approval policy: three lanes, risky topics escalated with no draft, and **auto-send off by default**: when an admin enables it, only the safest Ready-to-send drafts go out unattended.
- PII masking before the model, and code (not the model) deciding lanes.
- The knowledge loop: unanswered questions become knowledge-base articles.
- Deployment on the author's own server, with secrets kept out of the repository and the image.
- Reporting: results only from actual runs, including where Frontdesk did not beat the baseline.
