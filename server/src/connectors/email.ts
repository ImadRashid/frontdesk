// Email connector: IMAP (imapflow, IDLE) to listen, SMTP (nodemailer) to reply.
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import type { InMessage } from '../types.ts'
import { channelConfig, getChannelRow, listChannelRows, updateChannel } from '../db.ts'
import { ingest } from '../ingest.ts'

export type ServerCfg = { host: string; port: number; secure: boolean; user: string; pass: string }
export type EmailConfig = { imap: ServerCfg; smtp: ServerCfg; address: string; lastUid?: number }

type Conn = { client: ImapFlow | null; stopped: boolean; timer: NodeJS.Timeout | null; attempt: number; lastUid: number; busy: Promise<void> }
const conns = new Map<string, Conn>()

export function humanImapError(e: any): string {
  const msg = String(e?.responseText || e?.message || e || '')
  if (e?.authenticationFailed || /auth|credentials|password|login/i.test(msg)) return 'Wrong password — for Gmail use an App Password'
  if (e?.code === 'ENOTFOUND') return `Server not found (${e?.hostname || 'host'}) — check the IMAP host`
  if (e?.code === 'ECONNREFUSED') return 'Connection refused — check the IMAP port and SSL setting'
  if (e?.code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'Connection timed out — check host/port'
  return msg ? `IMAP error: ${msg.slice(0, 160)}` : 'IMAP connection failed'
}

function makeClient(cfg: ServerCfg): ImapFlow {
  return new ImapFlow({
    host: cfg.host, port: Number(cfg.port) || 993, secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.pass }, logger: false as any,
  })
}

// Used by POST /api/channels/email before saving: just tries to log in.
export async function testImap(cfg: ServerCfg): Promise<void> {
  const client = makeClient(cfg)
  client.on('error', () => {})
  try {
    await client.connect()
  } catch (e) {
    throw new Error(humanImapError(e))
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

function headerMap(parsed: any): Record<string, string> {
  const out: Record<string, string> = {}
  const keep = ['list-unsubscribe', 'list-id', 'auto-submitted', 'precedence', 'x-auto-response-suppress', 'message-id', 'in-reply-to', 'references', 'return-path']
  try {
    for (const [k, v] of parsed.headers as Map<string, any>) {
      if (!keep.includes(k)) continue
      out[k] = typeof v === 'string' ? v : Array.isArray(v) ? v.join(' ') : (v?.text ?? v?.value?.[0]?.address ?? JSON.stringify(v))
    }
  } catch { /* ignore */ }
  return out
}

async function processUid(channelId: string, client: ImapFlow, uid: number, ownAddress: string) {
  const msg: any = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true })
  if (!msg?.source) return
  const parsed: any = await simpleParser(msg.source)
  const from = parsed.from?.value?.[0] || {}
  const fromAddr = String(from.address || '').toLowerCase()
  if (fromAddr && ownAddress && fromAddr === ownAddress.toLowerCase()) return // our own sent replies
  const refs = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
  const text = (parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '') || '').trim()
  const inMsg: InMessage = {
    channel: 'email', channel_id: channelId,
    external_id: parsed.messageId || `uid-${uid}`,
    from_name: from.name || fromAddr, from_address: fromAddr,
    subject: parsed.subject || null, text: text.slice(0, 20000),
    received_at: (parsed.date || new Date()).toISOString(),
    thread_key: refs[0] || parsed.inReplyTo || parsed.messageId || null,
    headers: headerMap(parsed),
  }
  await ingest(inMsg)
}

async function fetchNew(channelId: string, conn: Conn, cfg: EmailConfig) {
  const client = conn.client
  if (!client) return
  const uids = (await client.search({ uid: `${conn.lastUid + 1}:*` }, { uid: true })) || []
  for (const uid of uids.filter((u) => u > conn.lastUid).sort((a, b) => a - b)) {
    try { await processUid(channelId, client, uid, cfg.address) } catch (e) { console.error(`[email] ${channelId} uid ${uid} failed:`, (e as Error).message) }
    conn.lastUid = Math.max(conn.lastUid, uid)
  }
  const stored = channelConfig<EmailConfig>(channelId)
  if (stored && stored.imap) updateChannel(channelId, { config_json: JSON.stringify({ ...stored, lastUid: conn.lastUid }) })
}

function scheduleReconnect(channelId: string, conn: Conn, detail: string) {
  if (conn.stopped || conn.timer) return
  conn.attempt++
  const delay = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(conn.attempt - 1, 6))
  const auth = /Wrong password/.test(detail)
  updateChannel(channelId, { status: auth ? 'error' : 'connecting', detail: auth ? detail : `${detail} — retrying in ${Math.round(delay / 1000)}s` })
  if (auth && conn.attempt > 3) return // stop hammering the server with bad credentials
  conn.timer = setTimeout(() => { conn.timer = null; connect(channelId, conn).catch(() => {}) }, delay)
}

async function connect(channelId: string, conn: Conn) {
  if (conn.stopped) return
  const cfg = channelConfig<EmailConfig>(channelId)
  if (!cfg?.imap) { updateChannel(channelId, { status: 'error', detail: 'Missing IMAP settings' }); return }
  const client = makeClient(cfg.imap)
  conn.client = client
  client.on('error', (e: any) => { console.error(`[email] ${channelId} error:`, humanImapError(e)) })
  client.on('close', () => {
    if (conn.client !== client) return
    conn.client = null
    if (!conn.stopped) scheduleReconnect(channelId, conn, 'Connection closed')
  })
  try {
    updateChannel(channelId, { status: 'connecting', detail: 'Connecting to IMAP…' })
    await client.connect()
    const mb: any = await client.mailboxOpen('INBOX')
    const uidNext = Number(mb?.uidNext || 1)
    if (!conn.lastUid) {
      // first connect: process at most the last 10 unseen messages from the last 2 days, then only new ones
      conn.lastUid = uidNext - 1
      try {
        const since = new Date(Date.now() - 2 * 24 * 3600 * 1000)
        const recent = ((await client.search({ seen: false, since }, { uid: true })) || []).sort((a, b) => a - b).slice(-10)
        for (const uid of recent) {
          try { await processUid(channelId, client, uid, cfg.address) } catch (e) { console.error(`[email] ${channelId} backlog uid ${uid}:`, (e as Error).message) }
        }
      } catch (e) { console.error(`[email] ${channelId} backlog search failed:`, (e as Error).message) }
      updateChannel(channelId, { config_json: JSON.stringify({ ...cfg, lastUid: conn.lastUid }) })
    } else {
      await fetchNew(channelId, conn, cfg) // catch up after reconnect
    }
    conn.attempt = 0
    updateChannel(channelId, { status: 'connected', detail: `Listening on INBOX (${cfg.imap.host})` })
    client.on('exists', () => {
      conn.busy = conn.busy.then(() => fetchNew(channelId, conn, cfg)).catch((e) => console.error(`[email] ${channelId} fetch failed:`, (e as Error).message))
    })
  } catch (e) {
    const detail = humanImapError(e)
    console.error(`[email] ${channelId} connect failed: ${detail}`)
    if (conn.client === client) conn.client = null
    try { client.close() } catch { /* ignore */ }
    scheduleReconnect(channelId, conn, detail)
  }
}

export async function startEmail(channelId: string) {
  await stopEmail(channelId)
  const cfg = channelConfig<EmailConfig>(channelId)
  const conn: Conn = { client: null, stopped: false, timer: null, attempt: 0, lastUid: Number(cfg?.lastUid || 0), busy: Promise.resolve() }
  conns.set(channelId, conn)
  connect(channelId, conn).catch((e) => console.error('[email] start failed:', (e as Error).message))
}

export async function stopEmail(channelId: string) {
  const conn = conns.get(channelId)
  if (!conn) return
  conn.stopped = true
  if (conn.timer) clearTimeout(conn.timer)
  const c = conn.client
  conn.client = null
  conns.delete(channelId)
  if (c) { try { await c.logout() } catch { try { c.close() } catch { /* ignore */ } } }
}

export async function sendEmailReply(channelId: string, to: { address: string; subject: string | null; messageId: string; references?: string }, text: string) {
  const cfg = channelConfig<EmailConfig>(channelId)
  if (!cfg?.smtp) throw new Error('Missing SMTP settings for this channel')
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host, port: Number(cfg.smtp.port) || 465, secure: cfg.smtp.secure !== false,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
  })
  const subject = to.subject ? (/^re:/i.test(to.subject) ? to.subject : `Re: ${to.subject}`) : 'Re: your message'
  const isMsgId = /^<.*>$/.test(to.messageId)
  const name = getChannelRow(channelId)?.name || 'Support'
  await transport.sendMail({
    from: { name, address: cfg.address || cfg.smtp.user }, to: to.address, subject, text,
    ...(isMsgId ? { inReplyTo: to.messageId, references: [to.references, to.messageId].filter(Boolean).join(' ') } : {}),
  })
}

export function restoreEmailChannels() {
  for (const r of listChannelRows()) {
    if (r.type === 'email' && r.status !== 'paused') startEmail(r.id).catch((e) => console.error('[email] restore failed:', e?.message))
  }
}
