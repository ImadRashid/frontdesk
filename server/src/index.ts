// Frontdesk API server (Hono on Node). See CONTRACT.md "HTTP API".
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve, relative } from 'node:path'
import type { ChannelType, InMessage, Lane, Team } from './types.ts'
import {
  counts, createChannel, deleteChannel, getChannelRow, getTask, listChannelRows, listTasks, patchTask, stats, toChannel,
  updateChannel, updateTriage, type View,
} from './db.ts'
import { ADMIN_EMAIL, checkCredentials, clearSession, issueSession, requireAuth, sessionEmail } from './auth.ts'
import { aiProvider, modelName } from './llm.ts'
import { deleteUpload, FILE_DIR, loadArticles, saveUpload } from './kb.ts'
import { extractDocument } from './extract.ts'
import { ingest } from './ingest.ts'
import { sendReply } from './send.ts'
import { getSetting, setChannelAutoSend, setSetting } from './db.ts'
import { triage } from './triage.ts'
import { restoreEmailChannels, sendEmailReply, startEmail, stopEmail, testImap, type ServerCfg } from './connectors/email.ts'
import { restoreWhatsAppChannels, sendWhatsApp, startWhatsApp, stopWhatsApp, whatsappQr } from './connectors/whatsapp.ts'

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', (e as Error)?.message || e))
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.message || e))

const ROOT = resolve(import.meta.dirname, '../..')
const app = new Hono()

app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err.message)
  return c.json({ error: err.message || 'Server error' }, 500)
})

app.use('/api/*', requireAuth)

const body = async (c: any): Promise<any> => { try { return await c.req.json() } catch { return {} } }
const channelOut = (id: string) => {
  const r = getChannelRow(id)
  return r ? toChannel(r, r.type === 'whatsapp' ? whatsappQr(id) : null) : null
}

// ---------- auth ----------
app.post('/api/login', async (c) => {
  const { email, password } = await body(c)
  if (!checkCredentials(email, password)) return c.json({ error: 'Wrong email or password' }, 401)
  issueSession(c, ADMIN_EMAIL)
  return c.json({ ok: true, email: ADMIN_EMAIL })
})
app.post('/api/logout', (c) => { clearSession(c); return c.json({ ok: true }) })
app.get('/api/me', (c) => c.json({ email: sessionEmail(c) }))
app.get('/api/health', (c) => c.json({ ok: true, ai: aiProvider(), model: modelName() }))

// ---------- tasks ----------
const VIEWS: View[] = ['open', 'reply', 'review', 'escalated', 'unanswered', 'done', 'filtered', 'all']
app.get('/api/tasks', (c) => {
  const v = (c.req.query('view') || 'all') as View
  const view = VIEWS.includes(v) ? v : 'all'
  return c.json({ items: listTasks(view, c.req.query('q') || ''), counts: counts() })
})

app.get('/api/tasks/:id', (c) => {
  const t = getTask(c.req.param('id'))
  return t ? c.json(t) : c.json({ error: 'Task not found' }, 404)
})

app.post('/api/tasks/:id/approve', async (c) => {
  const t = getTask(c.req.param('id'))
  if (!t) return c.json({ error: 'Task not found' }, 404)
  if (t.status === 'done') return c.json({ error: 'Already sent' }, 400)
  const { reply } = await body(c)
  const text = String(reply ?? t.draft ?? '').trim()
  if (!text) return c.json({ error: 'Reply is empty' }, 400)
  try {
    return c.json(await sendReply(t, text))
  } catch (e) {
    return c.json({ error: `Could not send: ${(e as Error).message}` }, 502)
  }
})

app.post('/api/tasks/:id/dismiss', async (c) => {
  const t = getTask(c.req.param('id'))
  if (!t) return c.json({ error: 'Task not found' }, 404)
  const { reason } = await body(c)
  patchTask(t.id, { status: 'dismissed', dismiss_reason: reason ? String(reason) : null })
  return c.json(getTask(t.id))
})

app.post('/api/tasks/:id/move', async (c) => {
  const t = getTask(c.req.param('id'))
  if (!t) return c.json({ error: 'Task not found' }, 404)
  const { lane, team } = await body(c)
  const patch: Record<string, string | number | null> = {}
  if (lane && ['reply', 'review', 'escalated'].includes(lane)) { patch.lane = lane as Lane; patch.qualifies = 1; patch.status = 'open' }
  if (team && ['support', 'billing', 'engineering', 'success', 'privacy'].includes(team)) patch.team = team as Team
  if (!Object.keys(patch).length) return c.json({ error: 'Nothing to change (lane or team required)' }, 400)
  patchTask(t.id, patch)
  return c.json(getTask(t.id))
})

app.post('/api/tasks/:id/retriage', async (c) => {
  const t = getTask(c.req.param('id'))
  if (!t) return c.json({ error: 'Task not found' }, 404)
  const msg: InMessage = {
    channel: t.channel, channel_id: t.channel_id, external_id: t.external_id, from_name: t.from_name, from_address: t.from_address,
    subject: t.subject, text: t.text, received_at: t.received_at, thread_key: t.thread_key, headers: t.headers,
  }
  const r = await triage(msg)
  updateTriage(t.id, r)
  if (t.status === 'dismissed') patchTask(t.id, { status: 'open' })
  return c.json(getTask(t.id))
})

// ---------- simulate / demo ----------
app.post('/api/simulate', async (c) => {
  const b = await body(c)
  if (!b.text || !String(b.text).trim()) return c.json({ error: 'text is required' }, 400)
  const hint: ChannelType = b.channel_hint === 'email' || b.channel_hint === 'whatsapp' ? b.channel_hint : 'test'
  const msg: InMessage = {
    channel: hint, channel_id: 'test', external_id: `sim-${randomUUID()}`,
    from_name: String(b.from_name || 'Test customer'), from_address: String(b.from_address || 'customer@example.com'),
    subject: b.subject ? String(b.subject) : null, text: String(b.text), received_at: new Date().toISOString(),
    thread_key: null, headers: b.headers && typeof b.headers === 'object' ? b.headers : {},
  }
  const task = await ingest(msg)
  return c.json(task)
})

let demoRunning = false
app.post('/api/demo/load', async (c) => {
  const file = resolve(ROOT, 'eval/cases.json')
  if (!existsSync(file)) return c.json({ ok: false, queued: 0, error: 'eval/cases.json not found yet' })
  let cases: any[] = []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    cases = Array.isArray(raw) ? raw : Array.isArray(raw?.cases) ? raw.cases : []
  } catch (e) {
    return c.json({ ok: false, queued: 0, error: `Could not read eval/cases.json: ${(e as Error).message}` })
  }
  if (demoRunning) return c.json({ ok: true, queued: 0, note: 'Demo load already running' })
  demoRunning = true
  ;(async () => {
    try {
      for (const k of cases) {
        try {
          const text = String(k.text ?? k.body ?? '')
          if (!text) continue
          await ingest({
            channel: k.channel === 'whatsapp' ? 'whatsapp' : 'email', channel_id: 'test', external_id: `demo-${k.id ?? randomUUID()}`,
            from_name: String(k.from_name || ''), from_address: String(k.from_address || ''), subject: k.subject ? String(k.subject) : null,
            text, received_at: new Date().toISOString(), thread_key: null, headers: k.headers && typeof k.headers === 'object' ? k.headers : {},
          })
        } catch (e) { console.error('[demo] case failed:', (e as Error).message) }
      }
    } finally { demoRunning = false }
  })()
  return c.json({ ok: true, queued: cases.length })
})

// ---------- channels ----------
app.get('/api/channels', (c) => c.json(listChannelRows().map((r) => toChannel(r, r.type === 'whatsapp' ? whatsappQr(r.id) : null))))

app.get('/api/channels/:id', (c) => {
  const ch = channelOut(c.req.param('id'))
  return ch ? c.json(ch) : c.json({ error: 'Channel not found' }, 404)
})

function serverCfg(x: any, fallback?: ServerCfg, defPort = 993): ServerCfg {
  return {
    host: String(x?.host || fallback?.host || '').trim(),
    port: Number(x?.port || defPort),
    secure: x?.secure === undefined ? true : !!x.secure,
    user: String(x?.user || fallback?.user || '').trim(),
    pass: String(x?.pass || fallback?.pass || ''),
  }
}

app.post('/api/channels/email', async (c) => {
  const b = await body(c)
  const imap = serverCfg(b.imap)
  if (!imap.host || !imap.user || !imap.pass) return c.json({ error: 'IMAP host, user and password are required' }, 400)
  const smtpRaw = b.smtp || {}
  const smtp = serverCfg(smtpRaw, { ...imap, host: imap.host.replace(/^imap\./, 'smtp.') }, 465)
  if (smtpRaw.port === undefined && smtpRaw.secure === false) smtp.port = 587
  try { await testImap(imap) } catch (e) { return c.json({ error: (e as Error).message }, 400) }
  const address = String(b.address || imap.user).trim()
  const id = createChannel('email', String(b.name || address), address, { imap, smtp, address }, 'connecting', 'Connecting…')
  await startEmail(id)
  return c.json(channelOut(id))
})

app.post('/api/channels/whatsapp', async (c) => {
  const b = await body(c)
  const id = createChannel('whatsapp', String(b.name || 'WhatsApp'), '', {}, 'connecting', 'Waiting for QR code…')
  await startWhatsApp(id)
  return c.json(channelOut(id))
})

// Toggles: pauses a running channel, resumes a paused one.
app.post('/api/channels/:id/pause', async (c) => {
  const id = c.req.param('id')
  const r = getChannelRow(id)
  if (!r) return c.json({ error: 'Channel not found' }, 404)
  if (r.status === 'paused') {
    if (r.type === 'email') await startEmail(id)
    else if (r.type === 'whatsapp') await startWhatsApp(id)
    else updateChannel(id, { status: 'connected', detail: 'Messages from the simulator and demo loader' })
  } else {
    if (r.type === 'email') await stopEmail(id)
    else if (r.type === 'whatsapp') await stopWhatsApp(id, false)
    updateChannel(id, { status: 'paused', detail: 'Paused — not listening' })
  }
  return c.json(channelOut(id))
})

app.delete('/api/channels/:id', async (c) => {
  const id = c.req.param('id')
  const r = getChannelRow(id)
  if (!r) return c.json({ error: 'Channel not found' }, 404)
  if (r.type === 'test') return c.json({ error: 'The test inbox cannot be removed' }, 400)
  if (r.type === 'email') await stopEmail(id)
  if (r.type === 'whatsapp') await stopWhatsApp(id, true)
  deleteChannel(id)
  return c.json({ ok: true })
})

// ---------- stats / kb ----------
// ---------- auto-send ----------
app.get('/api/settings', (c) => c.json({ auto_send_all: getSetting('auto_send_all', '0') === '1' }))
app.put('/api/settings', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { auto_send_all?: boolean }
  if (typeof b.auto_send_all === 'boolean') setSetting('auto_send_all', b.auto_send_all ? '1' : '0')
  return c.json({ auto_send_all: getSetting('auto_send_all', '0') === '1' })
})
app.post('/api/channels/:id/auto-send', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { enabled?: boolean }
  setChannelAutoSend(c.req.param('id'), !!b.enabled)
  return c.json({ ok: true, enabled: !!b.enabled })
})

app.get('/api/stats', (c) => c.json(stats(aiProvider())))
app.get('/api/kb', (c) => c.json(loadArticles().map(({ id, title, tags, body, uploaded, source, added, file }) => ({
  id, title, tags, body, uploaded: !!uploaded, source: source ?? null, added: added ?? null,
  file_url: file ? `/api/kb/${id}/file` : null, file_type: file ? file.split('.').pop() : null,
}))))

const MIME: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', md: 'text/markdown; charset=utf-8', markdown: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', text: 'text/plain; charset=utf-8' }
app.get('/api/kb/:id/file', (c) => {
  const a = loadArticles().find((x) => x.id === c.req.param('id'))
  const path = a?.file ? resolve(FILE_DIR, a.file) : ''
  if (!a?.file || !path.startsWith(FILE_DIR) || !existsSync(path)) return c.json({ error: 'Original file not found.' }, 404)
  const ext = a.file.split('.').pop() || ''
  return new Response(readFileSync(path), { headers: { 'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Disposition': `${ext === 'pdf' ? 'inline' : 'attachment'}; filename="${(a.source || a.file).replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' } })
})

// Admin uploads a PDF / Word / Markdown / text document; its text becomes help-center content.
app.post('/api/kb/upload', async (c) => {
  const form = await c.req.parseBody()
  const file = form['file']
  if (!(file instanceof File)) return c.json({ error: 'Choose a file to upload.' }, 400)
  if (file.size > 20 * 1024 * 1024) return c.json({ error: 'That file is over 20 MB. Split it or upload the relevant part.' }, 400)
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // The PDF reader takes ownership of (detaches) the buffer it is given, so give it a copy.
    const doc = await extractDocument(file.name, bytes.slice())
    const title = String(form['title'] || '').trim() || doc.title
    const a = saveUpload({ title, body: doc.text, source: file.name, tags: ['uploaded', doc.kind], original: { ext: doc.ext, data: bytes } })
    console.log(`[kb] uploaded ${file.name} -> ${a.id} (${doc.text.length} chars)`)
    return c.json({ id: a.id, title: a.title, chars: doc.text.length, pages: doc.pages ?? null })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Save an answer written by an agent (e.g. for an unanswered question) as a new help article.
app.post('/api/kb', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { title?: string; body?: string; source?: string }
  if (!b.title?.trim() || !b.body?.trim() || b.body.trim().length < 20) return c.json({ error: 'Add a title and at least a sentence of content.' }, 400)
  const a = saveUpload({ title: b.title.trim(), body: b.body, source: b.source || 'Written in Frontdesk', tags: ['answer'] })
  return c.json({ id: a.id, title: a.title })
})

app.delete('/api/kb/:id', (c) => {
  if (!deleteUpload(c.req.param('id'))) return c.json({ error: 'Only uploaded documents can be removed here. Built-in articles live in kb/.' }, 400)
  return c.json({ ok: true })
})
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

// ---------- static web (production build) ----------
const DIST = resolve(ROOT, 'web/dist')
if (existsSync(resolve(DIST, 'index.html'))) {
  const distRel = relative(process.cwd(), DIST) || '.'
  // Hashed assets never change: cache them for a year. A missing asset is a 404 that must not be cached,
  // never the HTML page (a CDN would otherwise cache HTML under a .js URL during a rolling deploy).
  app.use('/assets/*', async (c, next) => { await next(); if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable') })
  app.use('/*', serveStatic({ root: distRel }))
  app.get('/assets/*', (c) => { c.header('Cache-Control', 'no-store'); return c.text('Not found', 404) })
  app.get('*', (c) => { c.header('Cache-Control', 'no-cache, no-store, must-revalidate'); return c.html(readFileSync(resolve(DIST, 'index.html'), 'utf8')) })
}

// ---------- start ----------
const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port }, () => {
  console.log(`[frontdesk] API on http://localhost:${port}  ai=${aiProvider()} model=${modelName()}  kb=${loadArticles().length} articles`)
})

try { restoreEmailChannels() } catch (e) { console.error('[startup] email restore failed:', (e as Error).message) }
try { restoreWhatsAppChannels() } catch (e) { console.error('[startup] whatsapp restore failed:', (e as Error).message) }

export { app }
