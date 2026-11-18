// Sends a reply on the channel the message came from, and records it on the task.
import type { Task } from './types.ts'
import { getChannelRow, getTask, patchTask } from './db.ts'
import { sendEmailReply } from './connectors/email.ts'
import { sendWhatsApp } from './connectors/whatsapp.ts'

export async function sendReply(t: Task, text: string, opts: { auto?: boolean } = {}): Promise<Task | null> {
  const ch = getChannelRow(t.channel_id)
  if (ch?.type === 'email') {
    await sendEmailReply(t.channel_id, { address: t.from_address, subject: t.subject, messageId: t.external_id, references: t.headers?.references }, text)
  } else if (ch?.type === 'whatsapp') {
    await sendWhatsApp(t.channel_id, t.headers?.jid || t.from_address, text)
  } // test channel: just mark sent
  patchTask(t.id, {
    status: 'done', sent_at: new Date().toISOString(), final_reply: text,
    edited: (t.draft || '').trim() === text ? 0 : 1, auto_sent: opts.auto ? 1 : 0,
  })
  console.log(`[${opts.auto ? 'auto-send' : 'approve'}] ${t.id} via ${ch?.type || 'test'}`)
  return getTask(t.id)
}

// Auto-send is only ever allowed for the safest drafts: Ready to send, high confidence, no flags,
// no injection, AI mode, a real draft. Everything else still waits for a person.
export function autoSendEligible(t: Task): boolean {
  return t.qualifies && t.status === 'open' && t.lane === 'reply' && t.confidence === 'high' && t.mode === 'ai'
    && !!t.draft?.trim() && (t.flags?.length ?? 0) === 0 && (t.injection?.length ?? 0) === 0
}
