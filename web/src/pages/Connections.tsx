import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Info, Loader2, Mail, MessageCircle, Pause, Plus, ShieldCheck, Smartphone, Trash2, Zap } from 'lucide-react'
import { api, timeAgo, usePoll, type Channel } from '../api'
import { Badge, Button, ChannelLogo, cx, Field, Input, Logo, Modal, Spinner, useToast } from '../components/ui'

export default function Connections() {
  const { data, reload, loading } = usePoll<Channel[]>('/channels', 4000)
  const [emailOpen, setEmailOpen] = useState(false)
  const [waId, setWaId] = useState<string | null>(null)
  const [waStarting, setWaStarting] = useState(false)
  const toast = useToast()
  const channels = data ?? []
  const { data: settings, reload: reloadSettings } = usePoll<{ auto_send_all: boolean }>('/settings', 0)
  const allOn = !!settings?.auto_send_all

  async function setAll(v: boolean) {
    await api('/settings', { method: 'PUT', body: { auto_send_all: v } }).catch((e) => toast((e as Error).message, 'error'))
    reloadSettings()
    toast(v ? 'Auto-send is on for every channel' : 'Auto-send is off for all channels (per-channel switches still apply)')
  }
  async function setOne(ch: Channel, v: boolean) {
    await api(`/channels/${ch.id}/auto-send`, { body: { enabled: v } }).catch((e) => toast((e as Error).message, 'error'))
    reload()
  }

  async function startWhatsApp() {
    const n = channels.filter((c) => c.type === 'whatsapp').length
    const label = window.prompt('Label for this WhatsApp number (shown on every message from it)', n ? `WhatsApp ${n + 1}` : 'WhatsApp · Support line')
    if (label === null) return
    setWaStarting(true)
    try {
      const ch = await api<Channel>('/channels/whatsapp', { body: { name: label.trim() || 'WhatsApp' } })
      setWaId(ch.id)
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setWaStarting(false)
    }
  }

  async function remove(ch: Channel) {
    if (!confirm(`Disconnect ${ch.name}? Messages already received stay in Frontdesk.`)) return
    await api(`/channels/${ch.id}`, { method: 'DELETE' }).catch((e) => toast((e as Error).message, 'error'))
    reload()
  }
  async function pause(ch: Channel) {
    await api(`/channels/${ch.id}/pause`, { method: 'POST' }).catch((e) => toast((e as Error).message, 'error'))
    reload()
  }

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-5xl px-10 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-500">
          Where Frontdesk listens. Every connected inbox feeds the same queue, and replies go back out through the channel the customer used.
        </p>

        {/* auto-send */}
        <section className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-ink-200/80">
          <div className="flex items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70"><Zap className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-[15px] font-semibold">Auto-send safe replies</h2>
                <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink-700">
                  All channels <Toggle on={allOn} set={setAll} />
                </label>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
                When on, Frontdesk sends a reply without waiting for approval, but only if it is in <span className="font-medium text-emerald-700">Ready to send</span>,
                the AI is highly confident, it cites the knowledge base, and no check flagged anything. Turn it on for every channel here, or per channel below.
              </p>
              <p className="mt-2.5 flex items-start gap-2 text-[12.5px] text-ink-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                Never auto-sent: refunds, outages, privacy requests, anything escalated, anything that needs a look, and messages with text aimed at the AI.</p>
            </div>
          </div>
        </section>

        {/* connected */}
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-400">Connected</h2>
          {loading && !data ? <Spinner /> : (
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-ink-200/80">
              {channels.map((ch, i) => (
                <div key={ch.id} className={cx('flex items-center gap-4 px-5 py-4', i > 0 && 'border-t border-ink-100')}>
                  <span className="grid size-10 place-items-center rounded-xl bg-white ring-1 ring-ink-200/80"><ChannelLogo ch={ch} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ch.name}</span>
                      <StatusPill ch={ch} />
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-ink-500">
                      {ch.address || (ch.type === 'test' ? 'Built in. Send test messages from the Inbox.' : '—')}
                      {ch.detail && ch.status !== 'connected' && <span className="text-ink-400"> · {ch.detail}</span>}
                    </div>
                  </div>
                  <label title={allOn ? 'On for all channels (switch it off above to control channels one by one)' : 'Send safe replies on this channel automatically'}
                    className={cx('flex items-center gap-2 text-[12px] font-medium', allOn ? 'text-ink-400' : 'text-ink-600')}>
                    Auto-send <Toggle on={allOn || !!ch.auto_send} set={(v) => !allOn && setOne(ch, v)} />
                  </label>
                  <div className="hidden text-right text-[12px] text-ink-500 sm:block">
                    <div className="tabular-nums">{ch.message_count ?? 0} messages</div>
                    <div className="text-ink-400">{ch.last_message_at ? `last ${timeAgo(ch.last_message_at)}` : 'none yet'}</div>
                  </div>
                  {ch.type !== 'test' && (
                    <div className="flex gap-1">
                      {ch.type === 'whatsapp' && ch.status === 'connecting' && <Button size="sm" onClick={() => setWaId(ch.id)}>Show QR</Button>}
                      <button title={ch.status === 'paused' ? 'Resume' : 'Pause'} onClick={() => pause(ch)} className="rounded-md p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Pause className="size-4" /></button>
                      <button title="Disconnect" onClick={() => remove(ch)} className="rounded-md p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* add */}
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-400">Add a channel</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ConnectorCard
              icon={<span className="flex -space-x-2">{(['gmail', 'outlook', 'zoho'] as const).map((n) => <span key={n} className="grid size-11 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-ink-200"><Logo name={n} className="size-6" /></span>)}</span>}
              title="Email inbox"
              text="Any mailbox with IMAP and SMTP: Gmail, Google Workspace, Outlook, Zoho, your host. Connect as many inboxes as you like, each with its own label. Replies go out in the same thread."
              tags={['IMAP · listens live', 'SMTP · sends replies']}
              action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEmailOpen(true)}>{channels.some((c) => c.type === 'email') ? 'Connect another inbox' : 'Connect email'}</Button>}
            />
            <ConnectorCard
              icon={<span className="grid size-11 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-ink-200"><Logo name="whatsapp" className="size-6" /></span>}
              title="WhatsApp"
              text="Link one or more WhatsApp numbers the way you link WhatsApp Web: scan a QR code. Give each a label, like Sales or Support. Group chats and status updates are ignored."
              tags={['QR pairing', 'Prototype connector']}
              note="Uses an unofficial WhatsApp Web session. Use a dedicated business number. For production, switch to the WhatsApp Business API."
              action={<Button variant="primary" icon={<Smartphone className="size-4" />} loading={waStarting} onClick={startWhatsApp}>{channels.some((c) => c.type === 'whatsapp') ? 'Link another number' : 'Link WhatsApp'}</Button>}
            />
          </div>

          <h3 className="mb-3 mt-8 text-[13px] font-medium text-ink-500">Coming next</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <Logo name="google" className="size-5" />, title: 'Sign in with Google', text: 'One-click Gmail connection instead of an App Password.' },
              { icon: <Logo name="slack" className="size-5" />, title: 'Slack', text: 'Shared customer channels, plus P1 alerts.' },
              { icon: <Logo name="instagram" className="size-5" />, title: 'Instagram DMs', text: 'Through the Meta Business API.' },
              { icon: <Logo name="messenger" className="size-5" />, title: 'Messenger', text: 'Facebook page messages.' },
              { icon: <Logo name="telegram" className="size-5" />, title: 'Telegram', text: 'A bot for your support handle.' },
              { icon: <Logo name="intercom" className="size-5" />, title: 'Intercom', text: 'Import conversations from live chat.' },
              { icon: <Logo name="zendesk" className="size-5" />, title: 'Zendesk', text: 'Write triage back onto tickets.' },
              { icon: <Logo name="webhooks" className="size-5" />, title: 'Webhook', text: 'Contact forms and any tool that can POST.' },
            ].map((c) => (
              <div key={c.title} className="rounded-xl bg-white p-4 ring-1 ring-ink-200/80 opacity-90">
                <div className="flex items-center gap-2.5 text-[13.5px] font-medium text-ink-700">{c.icon}{c.title}<span className="ml-auto rounded-full bg-ink-100 px-1.5 text-[10.5px] font-medium text-ink-500">Soon</span></div>
                <p className="mt-1 text-[12.5px] leading-snug text-ink-500">{c.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <EmailModal open={emailOpen} onClose={() => setEmailOpen(false)} onSaved={() => { setEmailOpen(false); reload() }} />
      <WhatsAppModal id={waId} onClose={() => { setWaId(null); reload() }} />
    </div>
  )
}

function StatusPill({ ch }: { ch: Channel }) {
  if (ch.status === 'connected') return <Badge tone="green"><span className="live-dot size-1.5 rounded-full bg-emerald-500" />Listening</Badge>
  if (ch.status === 'connecting') return <Badge tone="amber"><Loader2 className="size-3 animate-spin" />Connecting</Badge>
  if (ch.status === 'paused') return <Badge>Paused</Badge>
  return <Badge tone="red" title={ch.detail ?? ''}><AlertCircle className="size-3" />Needs attention</Badge>
}

function ConnectorCard({ icon, title, text, tags, note, action }: { icon: React.ReactNode; title: string; text: string; tags: string[]; note?: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-6 ring-1 ring-ink-200/80 transition hover:shadow-lg hover:shadow-ink-900/[0.04]">
      <div className="flex items-start gap-4">
        {icon}
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
        </div>
      </div>
      <p className="mt-4 text-[13.5px] leading-relaxed text-ink-600">{text}</p>
      {note && <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900 ring-1 ring-amber-200/70"><Info className="mt-0.5 size-3.5 shrink-0" />{note}</p>}
      <div className="mt-5 flex-1" />
      <div>{action}</div>
    </div>
  )
}

// ---------------------------------------------------------------------- email
const PRESET_LOGO = { gmail: 'gmail', outlook: 'outlook', zoho: 'zoho' } as const
const PRESETS = {
  gmail: { label: 'Gmail / Workspace', imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true } },
  outlook: { label: 'Outlook / Microsoft 365', imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp.office365.com', port: 587, secure: false } },
  zoho: { label: 'Zoho Mail', imap: { host: 'imap.zoho.com', port: 993, secure: true }, smtp: { host: 'smtp.zoho.com', port: 465, secure: true } },
  other: { label: 'Other', imap: { host: '', port: 993, secure: true }, smtp: { host: '', port: 465, secure: true } },
}
type PresetKey = keyof typeof PRESETS

function EmailModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [preset, setPreset] = useState<PresetKey>('gmail')
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('Support inbox')
  const [imap, setImap] = useState(PRESETS.gmail.imap)
  const [smtp, setSmtp] = useState(PRESETS.gmail.smtp)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function choose(p: PresetKey) {
    setPreset(p)
    setImap(PRESETS[p].imap)
    setSmtp(PRESETS[p].smtp)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api('/channels/email', {
        body: { name, address, imap: { ...imap, user: address, pass: password }, smtp: { ...smtp, user: address, pass: password } },
      })
      toast(`${address} connected. Frontdesk is listening.`)
      setPassword('')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl" title="Connect an email inbox" subtitle="Frontdesk checks the login before saving. Passwords stay on this server."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!address || !password || !imap.host || !smtp.host} onClick={save}>Test & connect</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
            <button key={k} onClick={() => choose(k)} className={cx('rounded-lg px-2 py-2.5 text-[12px] font-medium ring-1 transition',
              preset === k ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-300')}>
              <span className="flex flex-col items-center gap-1.5">
                {k in PRESET_LOGO ? <Logo name={PRESET_LOGO[k as keyof typeof PRESET_LOGO]} className="size-5" /> : <Mail className="size-5 text-ink-400" />}
                {PRESETS[k].label}
              </span>
            </button>
          ))}
        </div>

        {preset === 'gmail' && (
          <div className="rounded-lg bg-sky-50 px-4 py-3 text-[12.5px] leading-relaxed text-sky-900 ring-1 ring-sky-200/70">
            <div className="font-medium">Gmail needs an App Password (2 minutes)</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Turn on 2-Step Verification for the Google account.</li>
              <li>Open <a className="inline-flex items-center gap-0.5 font-medium underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Passwords<ExternalLink className="size-3" /></a>, create one called “Frontdesk”.</li>
              <li>Paste the 16-letter password below. Your normal password won’t work.</li>
            </ol>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email address"><Input type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="support@yourcompany.com" /></Field>
          <Field label={preset === 'gmail' ? 'App Password' : 'Password'}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={preset === 'gmail' ? 'abcd efgh ijkl mnop' : '••••••••'} /></Field>
        </div>
        <Field label="Name in Frontdesk"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>

        <details className="group rounded-lg ring-1 ring-ink-200" open={preset === 'other'}>
          <summary className="cursor-pointer list-none px-4 py-2.5 text-[13px] font-medium text-ink-700">Server settings <span className="font-normal text-ink-400">· filled in for you</span></summary>
          <div className="grid grid-cols-[1fr_90px_80px] gap-3 border-t border-ink-100 px-4 py-3.5">
            <Field label="IMAP server"><Input value={imap.host} onChange={(e) => setImap({ ...imap, host: e.target.value })} placeholder="imap.example.com" /></Field>
            <Field label="Port"><Input type="number" value={imap.port} onChange={(e) => setImap({ ...imap, port: Number(e.target.value) })} /></Field>
            <Field label="SSL"><span className="mt-1.5 block" /><Toggle on={imap.secure} set={(v) => setImap({ ...imap, secure: v })} /></Field>
            <Field label="SMTP server"><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" /></Field>
            <Field label="Port"><Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></Field>
            <Field label="SSL"><span className="mt-1.5 block" /><Toggle on={smtp.secure} set={(v) => setSmtp({ ...smtp, secure: v })} /></Field>
          </div>
        </details>

        {error && <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      </div>
    </Modal>
  )
}

function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => set(!on)} className={cx('relative h-6 w-10 shrink-0 rounded-full transition', on ? 'bg-indigo-600' : 'bg-ink-300')}>
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

// ---------------------------------------------------------------------- whatsapp
function WhatsAppModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = usePoll<Channel>(id ? `/channels/${id}` : null, 2000)
  const connected = data?.status === 'connected'
  useEffect(() => {
    if (connected) {
      const t = setTimeout(onClose, 1800)
      return () => clearTimeout(t)
    }
  }, [connected, onClose])

  return (
    <Modal open={!!id} onClose={onClose} width="max-w-2xl" title={<span className="flex items-center gap-2"><Logo name="whatsapp" className="size-5" />Link WhatsApp</span>} subtitle="Scan with the phone that has the business number.">
      <div className="grid items-center gap-8 sm:grid-cols-[260px_1fr]">
        <div className="grid aspect-square place-items-center rounded-2xl bg-white ring-1 ring-ink-200">
          {connected ? (
            <div className="fade-up text-center">
              <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
              <div className="mt-2 font-medium">Linked</div>
              <div className="text-[13px] text-ink-500">{data?.address}</div>
            </div>
          ) : data?.qr ? (
            <img src={data.qr} alt="WhatsApp QR code" className="size-[236px] rounded-lg" />
          ) : data?.status === 'error' ? (
            <div className="px-6 text-center text-[13px] text-red-700"><AlertCircle className="mx-auto mb-2 size-6" />{data.detail || 'Could not start WhatsApp.'}</div>
          ) : (
            <div className="text-center text-[13px] text-ink-500"><Spinner className="mx-auto mb-2 size-6" />Getting a QR code…</div>
          )}
        </div>
        <ol className="space-y-4 text-[13.5px] text-ink-700">
          {[
            ['Open WhatsApp', 'on the phone with your business number.'],
            ['Go to Linked devices', 'Settings → Linked devices (iPhone) or ⋮ → Linked devices (Android).'],
            ['Tap “Link a device”', 'and point the camera at this code.'],
          ].map(([a, b], i) => (
            <li key={a} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{i + 1}</span>
              <span><span className="font-medium text-ink-900">{a}</span> {b}</span>
            </li>
          ))}
          <li className="flex gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-[12.5px] text-ink-500 ring-1 ring-ink-100">
            <MessageCircle className="mt-0.5 size-4 shrink-0" />Frontdesk only reads one-to-one chats. It never sends anything unless a person approves the reply.
          </li>
        </ol>
      </div>
    </Modal>
  )
}
