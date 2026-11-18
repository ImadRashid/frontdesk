// WhatsApp connector via Baileys: QR pairing -> data URL, listen messages.upsert, send replies.
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from 'baileys'
import QRCode from 'qrcode'
import pino from 'pino'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import type { InMessage } from '../types.ts'
import { DATA_DIR, listChannelRows, updateChannel, getChannelRow } from '../db.ts'
import { ingest } from '../ingest.ts'

type WaConn = { sock: any; qr: string | null; stopped: boolean; timer: NodeJS.Timeout | null; attempt: number }
const conns = new Map<string, WaConn>()

const authDir = (channelId: string) => resolve(DATA_DIR, `wa-${channelId}`)

export function whatsappQr(channelId: string): string | null {
  return conns.get(channelId)?.qr ?? null
}

function textOf(m: any): string {
  const msg = m?.message || {}
  return String(msg.conversation || msg.extendedTextMessage?.text || msg.ephemeralMessage?.message?.extendedTextMessage?.text || msg.ephemeralMessage?.message?.conversation || '').trim()
}

async function open(channelId: string, conn: WaConn) {
  if (conn.stopped) return
  const { state, saveCreds } = await useMultiFileAuthState(authDir(channelId))
  let version: any
  try { version = (await fetchLatestBaileysVersion()).version } catch { version = undefined }
  const sock: any = makeWASocket({
    ...(version ? { version } : {}),
    auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }) as any,
    markOnlineOnConnect: false, syncFullHistory: false,
  } as any)
  conn.sock = sock

  sock.ev.on('creds.update', () => { saveCreds().catch((e: any) => console.error('[whatsapp] saveCreds failed:', e?.message)) })

  sock.ev.on('connection.update', async (u: any) => {
    try {
      if (conn.stopped || conn.sock !== sock) return
      if (u.qr) {
        conn.qr = await QRCode.toDataURL(u.qr)
        updateChannel(channelId, { status: 'connecting', detail: 'Scan the QR code with WhatsApp → Linked devices' })
      }
      if (u.connection === 'open') {
        conn.qr = null
        conn.attempt = 0
        const own = String(sock.user?.id || '').split(':')[0].split('@')[0]
        updateChannel(channelId, { status: 'connected', detail: 'Listening for WhatsApp messages', address: own ? `+${own}` : '' })
      }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode
        conn.sock = null
        if (code === DisconnectReason.loggedOut) {
          conn.qr = null
          updateChannel(channelId, { status: 'error', detail: 'Logged out — scan again' })
          try { rmSync(authDir(channelId), { recursive: true, force: true }) } catch { /* ignore */ }
          return
        }
        if (conn.stopped) return
        conn.attempt++
        const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2_000 * 2 ** Math.min(conn.attempt - 1, 5))
        updateChannel(channelId, { status: 'connecting', detail: `Reconnecting… (${code ?? 'closed'})` })
        conn.timer = setTimeout(() => { conn.timer = null; open(channelId, conn).catch((e) => console.error('[whatsapp] reopen failed:', e?.message)) }, delay)
      }
    } catch (e) {
      console.error('[whatsapp] connection.update handler error:', (e as Error).message)
    }
  })

  sock.ev.on('messages.upsert', async (ev: any) => {
    try {
      if (ev.type !== 'notify') return
      for (const m of ev.messages || []) {
        try {
          const jid: string = m.key?.remoteJid || ''
          if (m.key?.fromMe) continue
          if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue
          const text = textOf(m)
          if (!text) continue
          const ts = Number(m.messageTimestamp || 0)
          const number = jid.split('@')[0].split(':')[0]
          const inMsg: InMessage = {
            channel: 'whatsapp', channel_id: channelId, external_id: String(m.key?.id || `${jid}-${ts}`),
            from_name: m.pushName || `+${number}`, from_address: jid.endsWith('@s.whatsapp.net') ? number : jid,
            subject: null, text, received_at: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
            thread_key: jid, headers: { jid },
          }
          await ingest(inMsg)
        } catch (e) {
          console.error('[whatsapp] message failed:', (e as Error).message)
        }
      }
    } catch (e) {
      console.error('[whatsapp] upsert handler error:', (e as Error).message)
    }
  })
}

export async function startWhatsApp(channelId: string) {
  await stopWhatsApp(channelId, false)
  const conn: WaConn = { sock: null, qr: null, stopped: false, timer: null, attempt: 0 }
  conns.set(channelId, conn)
  updateChannel(channelId, { status: 'connecting', detail: 'Starting WhatsApp session…' })
  open(channelId, conn).catch((e) => {
    console.error('[whatsapp] start failed:', e?.message)
    updateChannel(channelId, { status: 'error', detail: `Could not start WhatsApp: ${e?.message || e}` })
  })
}

export async function stopWhatsApp(channelId: string, wipeAuth: boolean) {
  const conn = conns.get(channelId)
  if (conn) {
    conn.stopped = true
    if (conn.timer) clearTimeout(conn.timer)
    try { conn.sock?.end?.(undefined) } catch { /* ignore */ }
    conns.delete(channelId)
  }
  if (wipeAuth) { try { rmSync(authDir(channelId), { recursive: true, force: true }) } catch { /* ignore */ } }
}

export async function sendWhatsApp(channelId: string, to: string, text: string) {
  const conn = conns.get(channelId)
  if (!conn?.sock || getChannelRow(channelId)?.status !== 'connected') throw new Error('WhatsApp channel is not connected')
  const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`
  await conn.sock.sendMessage(jid, { text })
}

export function restoreWhatsAppChannels() {
  for (const r of listChannelRows()) {
    if (r.type === 'whatsapp' && r.status !== 'paused') startWhatsApp(r.id).catch((e) => console.error('[whatsapp] restore failed:', e?.message))
  }
}
