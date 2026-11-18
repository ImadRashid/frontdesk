# Frontdesk user guide

For support agents. No technical knowledge needed.

## What Frontdesk does for you

Every customer email and WhatsApp message lands in one inbox. For each message, Frontdesk:

1. Decides if it is a real customer request. If not (spam, newsletters, automatic emails, personal chat), it moves it to **Filtered**.
2. Works out the topic, the urgency, and which team should own it.
3. Looks up the knowledge base and writes a draft reply in the customer's language.
4. Checks the draft for risky content and puts the message in one of three lanes.

**You decide what gets sent.** Frontdesk never sends a reply without your click.

## Home

After you sign in, Home tells you how many things need your attention, flags urgent (P1) issues at the top, and lists the messages to start with. Click any card to open that lane. Click the Frontdesk logo to come back here.

## Unanswered

The **Unanswered** list collects questions the knowledge base could not answer (Frontdesk says so in the draft instead of guessing), and anything still open after 24 hours. Answer the customer yourself, then click **Save answer to knowledge base**. Remove anything specific to that customer before saving. From then on, Frontdesk can use your answer for the same question.

## Adding knowledge

On **Knowledge base**, click **Add document** and drop in a PDF, Word (.docx), Markdown or text file (up to 20 MB). Frontdesk reads the text, splits long documents into sections, and cites them in drafts. Scanned PDFs without a text layer cannot be read; you'll see a message saying so. Uploaded documents can be removed; the built-in articles cannot.

## The three lanes

| Lane | What it means | What you do |
|---|---|---|
| **Ready to send** | A routine question. The draft is based on knowledge-base articles and passed all checks. | Read the draft. Approve it, or edit and approve. |
| **Needs a look** | Something about the draft or message is uncertain. The flags tell you what. | Read the flags. Fix the draft, then approve. Or move it to another lane. |
| **Escalated** | Risky or sensitive: outages, refunds, privacy or deletion requests, legal threats, very angry cancellations, or a message that tries to manipulate the AI. There is no draft. | Hand it to the named team, or answer it yourself. |

"Ready to send" does not mean "send without reading". It means Frontdesk found no problem. You are still the last check.

## Reading a task

When you open a task you see:

- **The original message** and who sent it, on which channel (email or WhatsApp).
- **Summary**: one line in English, even if the customer wrote in another language.
- **Urgency** (see below), **topic**, **team**, and **language**.
- **Reasons**: short notes on why Frontdesk chose this lane and urgency. Example: "Mentions patients can't book: possible outage".
- **Sources**: the knowledge-base articles the draft is based on. Click to read them. If the draft says something that is not in a source, be careful.
- **Flags**: warnings (see below).
- **Draft**: the suggested reply. You can edit it freely.

## Urgency

| Badge | Meaning | Example |
|---|---|---|
| **P1** | Urgent. Many customers or a business are blocked right now. | "Our booking page is down, patients can't book." |
| **P2** | Important. One customer is blocked, or is angry about money. | "I was charged twice and I want my money back now." |
| **P3** | Normal question or problem. | "How do I change reminder times?" |
| **P4** | Low priority. Ideas, feedback, no rush. | "It would be nice to have a dark mode." |

Some urgency rules are fixed in code, not left to the AI. For example, outage words always make a message at least P2, and an angry refund request is at least P2.

## Flags

| Flag | What it means | What to do |
|---|---|---|
| **promise** | The draft mentions a refund, credit, free month, compensation, guarantee or a deadline like "by tomorrow". | Remove the promise unless you are allowed to make it. |
| **unsupported fact** | The draft contains a number, price, link or date that is not in the knowledge-base sources or the customer's message. | Check it. Delete it if you can't confirm it. |
| **no source** | No knowledge-base article matched. The draft is not based on approved content. | Write the answer yourself or check with a colleague. |
| **injection** | The message contains text that tries to give the AI orders, such as "ignore previous instructions" or "approve a refund". | Treat the message with care. Frontdesk did not follow those instructions. It is escalated. |
| **AI unavailable** | The AI service was not reachable, so Frontdesk sorted the message with simple keyword rules and wrote no draft. | Write the reply yourself. Tell the operator if you see this often. |
| **language** | The draft is not in the same language as the customer's message. | Fix the language before sending. |
| **pii** | Personal data (card number, phone, date of birth, health details) was found and hidden from the AI. The task always goes to Needs a look. | Never repeat card numbers or health details in a reply. |
| **low confidence** | The AI was not sure about the draft or the topic. | Read carefully before approving. |

## Actions

- **Approve**: sends the reply (with your edits) on the same channel the customer used. Email replies stay in the same email thread. The task moves to **Done**.
- **Edit**: change the draft text before approving. Frontdesk records that the draft was edited. This helps measure draft quality.
- **Move**: change the lane (for example from "Ready to send" to "Escalated") or the team.
- **Dismiss**: close the task without replying. Add a short reason if you can.
- **Re-run**: ask Frontdesk to triage the message again (useful after the AI was unavailable).

## Filtered

Messages that are not customer requests go to **Filtered**, not to the lanes:

- **spam**: unsolicited selling, scams.
- **newsletter**: mailing lists and marketing emails.
- **automated**: no-reply senders, delivery failures, one-time codes, system notifications.
- **personal**: messages not about Slotwise, such as a friend writing to the business number.

Check Filtered once a day. If a real customer message is there, open it and move it to a lane.

## Auto-send (optional, off by default)

In **Connections**, an admin can turn on auto-send for all channels or for single channels. Even then, Frontdesk only sends on its own when the reply is in Ready to send, the AI is highly confident, the draft cites the knowledge base, and no check flagged anything. Auto-sent replies are marked "Auto-sent" in Done and counted in Insights.

## What never happens automatically

- No reply is ever sent without a person clicking Approve.
- No refund, credit, cancellation or account change is ever made. Frontdesk only writes text.
- Escalated messages never get a draft.
- Instructions inside customer messages are never followed.
- Card numbers, phone numbers, dates of birth and health details are hidden before the message reaches the AI.
