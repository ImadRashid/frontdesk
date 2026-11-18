# Frontdesk

Frontdesk is one inbox for every customer message. It reads email and WhatsApp, filters out what is not a real customer request, sorts the rest by topic and urgency, and drafts a reply from the knowledge base. A person approves every reply before it is sent, unless an admin turns on auto-send, which only ever sends drafts that pass every check.

The demo business is **Slotwise**, a made-up appointment-booking product for small clinics and salons. Its tickets and knowledge-base articles are synthetic, so no customer data is involved. See [docs/CASE_STUDY.md](docs/CASE_STUDY.md) for the problem and results.

## Live demo

**https://mufin.imad.website**

| | |
|---|---|
| Email | `admin@slotwise.test` |
| Password | `Mufin-lKZ4OSZbwtEZ` |

The inbox is pre-loaded with the 24 demo messages. Runs the same code as this repo, deployed with the Dockerfile on a self-hosted Coolify server behind a Cloudflare tunnel.

## Setup (3 steps)

You need Node.js 22.18 or newer.

1. Install:
   ```bash
   npm install
   ```
2. Configure:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set:
   - `ANTHROPIC_API_KEY` (preferred) **or** `OPENROUTER_API_KEY`. With no key, Frontdesk still runs in "rules mode": it sorts messages but writes no drafts.
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`. This is the sign-in for the web app.
   - `SESSION_SECRET`. Any long random string.
3. Run:
   ```bash
   npm run dev
   ```
   Open http://localhost:5180 and sign in.

**Production:** `npm run build && npm start`. The app and API are served together on http://localhost:8787 (change with `PORT`).

## Try it in 1 minute

1. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Open **Inbox**.
3. Click **Load demo messages** to load the labelled test messages, or **Send a test message** to type your own.
4. Open a task. Read the reasons, sources and flags. Edit the draft if needed. Click **Approve**.

Test messages go to the built-in "Test inbox" channel, so approving them sends nothing to anyone.

## What's in the app

- **Home**: "You have N things that need your attention", urgent issues first, and where to start.
- **Inbox lanes**: Ready to send, Needs a look, Escalated, Unanswered, Done, Filtered out.
- **Unanswered**: questions the knowledge base can't answer. Answer once, save it to the knowledge base, and Frontdesk uses it next time.
- **Knowledge base**: built-in articles plus PDFs, Word files and notes that admins upload.
- **Connections**: email (Gmail, Outlook, Zoho or any IMAP/SMTP) and WhatsApp (QR link).
- **Insights**: volume, urgent issues, edit rate, triage time and AI cost.

## Connect a real email inbox (Gmail)

Frontdesk uses IMAP to read and SMTP to send.

1. In your Google account, turn on **2-Step Verification**.
2. Create an **App Password** (Google Account > Security > App passwords). Copy the 16-character password.
3. In Frontdesk, go to **Connections > Email** and enter:
   - IMAP: `imap.gmail.com`, port `993`, SSL on
   - SMTP: `smtp.gmail.com`, port `465`, SSL on
   - Username: the full Gmail address. Password: the App Password (not your normal password).
4. Save. Frontdesk tests the IMAP login first and shows a plain error if it fails.

Other providers work the same way with their own IMAP/SMTP settings.

## Connect WhatsApp

1. Go to **Connections > WhatsApp** and click connect. A QR code appears.
2. On the phone: WhatsApp > **Settings > Linked devices > Link a device**, then scan the QR code.
3. The status changes to "connected".

Use a dedicated business number, not a personal one. Group chats and status updates are ignored. This connection uses Baileys, an unofficial WhatsApp Web library. It is fine for a prototype, but see the limitations below.

## Run the evaluation

```bash
npm run eval
```

This runs the labelled test messages in `eval/cases.json` through a simple baseline and through Frontdesk, and writes a report to `eval/results/<run>/summary.md`. Details: [docs/EVALUATION.md](docs/EVALUATION.md).

Unit tests for the deterministic rules: `npm test`.

## Docs

| Document | For |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Support agents using the inbox |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | The person who installs and runs Frontdesk |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works, data contracts, trade-offs, security |
| [docs/EVALUATION.md](docs/EVALUATION.md) | Test set, rubric, baseline, results |
| [docs/CASE_STUDY.md](docs/CASE_STUDY.md) | The problem, decisions, results and next steps |
| [docs/AI_COLLABORATION.md](docs/AI_COLLABORATION.md) | How AI tools were used to build this |

## Limitations

- **Demo data.** The demo business, its tickets and knowledge base are synthetic, to keep customer data private. A pilot with a real support team is the next step.
- **WhatsApp uses an unofficial library (Baileys).** WhatsApp may log out or ban numbers that use it. For production, use the official WhatsApp Business Cloud API.
- **Gmail uses an App Password,** not OAuth. OAuth is the next step.
- **One admin account.** There are no per-agent accounts or roles yet.
- **Not a ticketing system.** No SLAs, assignments or history across conversations beyond simple threading.
- **Knowledge-base search is keyword-based.** It can miss articles that use different words from the customer.
- **The model can be wrong.** That is why every reply needs a human approval and why risky topics go to a person with no draft.
