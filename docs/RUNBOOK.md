# Frontdesk operator runbook

For the person who installs, runs and maintains Frontdesk. Assumes basic comfort with a terminal.

## Install

Requirements: Node.js 22.18 or newer (uses the built-in `node:sqlite`). No database server is needed.

```bash
npm install
cp .env.example .env      # then edit .env
npm run dev               # development: API on :8787, web on :5180
npm run build && npm start   # production: everything on :8787
```

Run it behind HTTPS (a reverse proxy such as Caddy or nginx) if anyone accesses it over a network. The session cookie is the only thing protecting the inbox.

## Deploy (Docker / Coolify)

The `Dockerfile` builds the web app and runs the API, which also serves the web app, on port 8787 (health check: `/api/health`).

- Mount a persistent volume at `/app/data`. It holds the database, WhatsApp sessions and uploaded documents.
- Set the same variables as `.env` (below) in the platform, never in the image.
- Current deployment: Coolify project "Mufin Frontdesk", Dockerfile build from the `main` branch with a read-only deploy key, domain `http://mufin.imad.website`. HTTPS is terminated by the Cloudflare tunnel.
- To redeploy, push to `main`, then press Deploy in Coolify (no auto-deploy webhook is set up).

## Environment variables (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | One of these two | Claude API key. Preferred. |
| `OPENROUTER_API_KEY` | One of these two | Used only if no Anthropic key is set. |
| `MODEL` | No | Anthropic model id. Default `claude-sonnet-5-5`. |
| `OPENROUTER_MODEL` | No | OpenRouter model id. Default `anthropic/claude-sonnet-5.5`. |
| `ADMIN_EMAIL` | Yes | Sign-in email for the web app. |
| `ADMIN_PASSWORD` | Yes | Sign-in password. |
| `SESSION_SECRET` | Yes | Signs the session cookie. Long and random. |
| `PORT` | No | Server port. Default `8787`. |

With no AI key, Frontdesk runs in **rules mode** (see below). It does not crash.

## Where data lives

Everything is in `data/` (git-ignored). Treat this folder as sensitive.

| Path | Contents |
|---|---|
| `data/frontdesk.db` | SQLite database: messages, tasks, triage results, sent replies, channel settings (including IMAP/SMTP passwords). |
| `data/wa-*` | WhatsApp session keys, one folder per WhatsApp channel. Anyone with this folder can act as that WhatsApp number. |

The API never returns channel passwords; they are masked in the UI.

## Channels

- **Add email:** Connections > Email. Frontdesk tests the IMAP login before saving. For Gmail, see README (App Password, `imap.gmail.com:993` SSL, `smtp.gmail.com:465` SSL).
- **Add WhatsApp:** Connections > WhatsApp > scan the QR code from the phone (Linked devices).
- **Pause:** stops listening without deleting settings. Use this during incidents or maintenance.
- **Remove:** deletes the channel. For WhatsApp, also remove the linked device on the phone (WhatsApp > Linked devices) and delete the matching `data/wa-*` folder if it is still there.
- The **Test inbox** channel always exists. Messages sent from the UI ("Send a test message", "Load demo messages") go there and approving them sends nothing externally.

## Rotate the admin password

1. Change `ADMIN_PASSWORD` in `.env`.
2. To sign out all existing sessions, also change `SESSION_SECRET`.
3. Restart the server.

## Troubleshooting

### AI key missing or invalid (rules mode)

Symptoms: tasks show the **AI unavailable** flag, no drafts, everything lands in "Needs a look". `GET /api/health` shows `ai: "none"`, or the server log shows API errors.

What happens: Frontdesk falls back to keyword rules for topic and urgency. Escalation rules (outage, refund, privacy, injection) still apply because they are code. No drafts are written.

Fix: set a valid `ANTHROPIC_API_KEY` (or `OPENROUTER_API_KEY`), restart, then use **Re-run** on affected tasks. Check the provider's console for billing limits or a revoked key.

### IMAP login fails

- Gmail: the password must be an **App Password**, and 2-Step Verification must be on. A normal Google password will not work.
- Check host, port and SSL: `imap.gmail.com`, `993`, SSL on.
- If it worked before and stopped: the App Password may have been revoked, or the Google account password changed (this revokes App Passwords). Create a new one and re-add the channel.
- Some workplace Google accounts block App Passwords. Ask the Google Workspace admin.

### SMTP send fails on approve

The task stays open and the UI shows the error. Check SMTP settings (`smtp.gmail.com`, `465`, SSL on) and the App Password. Gmail also has daily sending limits.

### WhatsApp logged out

Symptoms: channel status "error" or "connecting", no new WhatsApp messages.

- The phone may have removed the linked device, or been offline for a long time. Remove the channel and connect again with a new QR code.
- Keep the phone online and WhatsApp installed.

### WhatsApp ban risk

The WhatsApp connection uses Baileys, an **unofficial** library. WhatsApp can restrict or ban numbers that use unofficial clients, especially for high volume or messaging people who did not write first.

- Use a dedicated business number, never a personal one.
- Only reply to people who wrote to you. Frontdesk only replies to incoming messages.
- For production, move to the official WhatsApp Business Cloud API.

### Messages not appearing

1. Check **Connections**: is the channel "connected" and not paused? Check `last_message_at`.
2. Check **Filtered**: the message may have been classified as spam, newsletter, automated or personal.
3. Search the inbox (all views) for the sender. Duplicates are dropped by message id, so a re-delivered message will not appear twice.
4. Email: Frontdesk reads the INBOX folder. Messages that Gmail filters straight to other labels or spam are not seen.
5. WhatsApp: group chats and status updates are ignored on purpose.
6. Check the server log for connector errors.

### Cost spikes

- Open the stats (`GET /api/stats`): `cost_usd` and `total` show spend and volume. Each task also stores its own `cost_usd`.
- Common causes: a mail loop (an auto-reply bouncing back and forth), a newsletter not caught by the prefilter, or a flood of WhatsApp messages.
- Immediate action: **pause** the channel. Then add the sender pattern to the prefilter in `server/src/rules.ts`.
- To stop all AI spend at once, remove the API key and restart. Frontdesk keeps sorting in rules mode.

## Logs

The server logs to stdout (pino, JSON lines). In development they appear in the `api` pane of `npm run dev`. In production, redirect stdout to a file or your process manager (systemd, pm2, Docker) and keep at least 14 days.

Each triage is also stored in the database with its mode (`ai` or `rules`), model, cost, time taken, reasons and flags. This is the audit trail for "why did Frontdesk do that?".

## Backups

Stop the server (or pause channels), then copy the `data/` folder. `data/frontdesk.db` is the important file. Restore by copying it back. Store backups encrypted: they contain customer messages and channel passwords.

## Update knowledge-base articles

Two sources: built-in articles in `kb/*.md` (versioned with the code) and documents uploaded in the app or saved from answers, stored as Markdown in `data/kb/` (gitignored, back it up with the database). Uploads accept PDF (text layer only), DOCX, Markdown and text, up to 20 MB. Long documents are split into ~1,500-character sections for search; drafts cite sections as `doc-<name>#<n>`.

### Built-in articles

Articles are Markdown files in `kb/`. Each starts with front matter:

```markdown
---
id: kb-status-outages
title: Service status, outages and incident updates
tags: [status, outage, down, incident, not-loading, error]
---
Article text...
```

- `id` must be unique and should not change once used (tasks store it as a source).
- `tags` help search find the article. Add the words customers actually use.
- Restart the server after editing so the articles are reloaded.
- Drafts may only use facts from these articles. If a price, link or date is not in an article, the draft gets an "unsupported fact" flag. Keep articles accurate: they are the source of truth for every draft.

## Change routing and lane rules

Lane, urgency floor, injection, prefilter and draft checks are plain code in `server/src/rules.ts`:

- `detectInjection`: phrases that mark a message as a manipulation attempt.
- `prefilter`: senders and headers that are filtered without calling the AI.
- Urgency floor: outage words that force P1/P2.
- `checkDraft`: promise words and unsupported-fact checks.
- `decideLane`: which topics escalate, which conditions send a task to "Needs a look", and which team owns what.

After changing them, run `npm test`, then run the evaluation.

## Before and after any prompt or rule change

1. Run `npm run eval` on the current version. Note the run folder in `eval/results/`.
2. Make the change (prompts are in `server/src/triage.ts`, rules in `server/src/rules.ts`).
3. Run `npm test` and `npm run eval` again.
4. Compare the two `summary.md` files. Do not ship a change that lowers P1 caught, injection caught, or raises unsafe replies, even if other numbers improve.
