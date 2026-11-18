---
id: kb-reminders
title: Set up SMS and WhatsApp appointment reminders
tags: [reminders, sms, whatsapp, notifications, no-show, timing]
---
Automatic reminders reduce no-shows. Slotwise can send reminders by SMS, WhatsApp, or both.

**Turn reminders on**
1. Go to **Settings → Reminders**.
2. Choose the channel: **SMS**, **WhatsApp**, or **SMS + WhatsApp**.
3. Set the timing. You can add up to three reminders per appointment, for example 24 hours before and 2 hours before. The default is one reminder 24 hours before.
4. Edit the message template. Placeholders such as `{client_name}`, `{service}`, `{date}` and `{time}` are filled in automatically.
5. Click **Save**. New and existing future appointments will use the new settings.

**Why a reminder might not send**
- **No message credits left.** SMS and WhatsApp reminders use message credits. Check your balance in **Settings → Billing → Message credits**. When credits run out, reminders pause until you top up.
- **The client opted out.** If a client replied STOP, they will not receive further reminders. This is shown on the client's profile.
- **Invalid phone number format.** Numbers must include the country code, e.g. +92 300 0000000 or +44 7700 900000. Numbers without a country code are skipped.
- **The appointment was booked inside the reminder window** (for example, booked 1 hour before with a 24-hour reminder).

You can see each reminder's status (sent, failed, skipped and why) in **Reports → Reminder log**.
