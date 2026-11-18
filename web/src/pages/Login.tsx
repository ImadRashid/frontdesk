import { useState } from 'react'
import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '../api'
import { Button, Field, Input, Logo as BrandLogo } from '../components/ui'
import { Logo } from '../components/Layout'

export default function Login({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ ok: boolean; email: string }>('/login', { body: { email, password } })
      onSignedIn(r.email)
    } catch (err) {
      setError((err as Error).message === 'Request failed (401)' ? 'That email and password don’t match.' : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------------------- story */}
      <div className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[420px] rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5 text-white"><Logo dark /></div>

        <div className="relative">
          <h1 className="max-w-md text-[34px] font-semibold leading-[1.15] tracking-tight text-white">
            Every customer message.<br /><span className="text-indigo-300">One calm queue.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-300">
            Frontdesk listens to your inboxes and WhatsApp, sorts real requests from noise, drafts replies from your knowledge base and
            hands each one to a person to approve.
          </p>

          <FlowIllustration />
        </div>

        <div className="relative flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-400">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-400" />Nothing is sent without approval</span>
          <span className="inline-flex items-center gap-1.5"><Lock className="size-4 text-emerald-400" />Personal data masked before AI</span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- form */}
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm fade-up">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-500">Welcome back. Your queue is waiting.</p>

          <div className="mt-8 space-y-4">
            <Field label="Work email">
              <Input type="email" autoFocus autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">{error}</p>}

          <Button type="submit" variant="primary" loading={busy} className="mt-6 h-10 w-full">
            Sign in <ArrowRight className="size-4" />
          </Button>

        </form>
      </div>
    </div>
  )
}

function FlowIllustration() {
  const sources = [
    { icon: <BrandLogo name="gmail" className="size-4" />, label: 'Gmail', tint: 'bg-white/[0.07] text-ink-100 ring-white/10' },
    { icon: <BrandLogo name="whatsapp" className="size-4" />, label: 'WhatsApp', tint: 'bg-white/[0.07] text-ink-100 ring-white/10' },
    { icon: <BrandLogo name="outlook" className="size-4" />, label: 'Outlook', tint: 'bg-white/[0.07] text-ink-100 ring-white/10' },
    { icon: <Mail className="size-4 text-sky-300" />, label: 'support@', tint: 'bg-white/[0.07] text-ink-100 ring-white/10' },
  ]
  return (
    <div className="mt-10 flex items-center gap-4">
      <div className="flex flex-col gap-2.5">
        {sources.map((s) => (
          <div key={s.label} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset ${s.tint}`}>
            {s.icon}{s.label}
          </div>
        ))}
      </div>
      <svg width="70" height="140" viewBox="0 0 70 140" className="shrink-0 text-ink-600">
        <path className="flow" d="M2 18 C 40 18, 30 70, 68 70" stroke="currentColor" fill="none" strokeWidth="1.5" />
        <path className="flow" d="M2 54 C 40 54, 30 70, 68 70" stroke="currentColor" fill="none" strokeWidth="1.5" />
        <path className="flow" d="M2 88 C 40 88, 30 70, 68 70" stroke="currentColor" fill="none" strokeWidth="1.5" />
        <path className="flow" d="M2 122 C 40 122, 30 70, 68 70" stroke="currentColor" fill="none" strokeWidth="1.5" />
      </svg>
      <div className="w-60 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10 backdrop-blur">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-indigo-300"><Sparkles className="size-3.5" />Triaged</div>
        <div className="mt-2 space-y-1.5">
          {[
            ['P1', 'Patients can’t book since 9am', 'bg-red-500/20 text-red-300'],
            ['P3', 'How do I change reminder time?', 'bg-sky-500/20 text-sky-300'],
            ['P2', 'Charged twice this month', 'bg-amber-500/20 text-amber-300'],
          ].map(([p, t, c]) => (
            <div key={t} className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5">
              <span className={`rounded px-1 text-[10px] font-semibold ${c}`}>{p}</span>
              <span className="truncate text-xs text-ink-200">{t}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-300">
          <span>Draft ready · cites 2 articles</span><span className="font-medium">Approve →</span>
        </div>
      </div>
    </div>
  )
}
