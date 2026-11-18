import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Loader2, Mail, FlaskConical, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { Channel, ChannelType, Urgency } from '../api'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ------------------------------------------------------------------ buttons
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all select-none whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500 active:bg-indigo-700',
        variant === 'success' && 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-500 active:bg-emerald-700',
        variant === 'secondary' && 'bg-white text-ink-800 ring-1 ring-ink-200 shadow-xs hover:bg-ink-50 hover:ring-ink-300',
        variant === 'ghost' && 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        variant === 'danger' && 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ badges
const TONES = {
  gray: 'bg-ink-100 text-ink-600 ring-ink-200/70',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70',
  red: 'bg-red-50 text-red-700 ring-red-200/70',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200/70',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/70',
}
export type Tone = keyof typeof TONES
export function Badge({ tone = 'gray', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset leading-4', TONES[tone], className)}>
      {children}
    </span>
  )
}

export const URGENCY_TONE: Record<Urgency, Tone> = { P1: 'red', P2: 'amber', P3: 'sky', P4: 'gray' }
export const URGENCY_LABEL: Record<Urgency, string> = { P1: 'Urgent', P2: 'High', P3: 'Normal', P4: 'Low' }
export function UrgencyBadge({ u, long }: { u: Urgency | null; long?: boolean }) {
  if (!u) return null
  return (
    <Badge tone={URGENCY_TONE[u]} title={`${u} · ${URGENCY_LABEL[u]}`}>
      {u === 'P1' && <span className="size-1.5 rounded-full bg-red-500" />}
      {u}{long && ` · ${URGENCY_LABEL[u]}`}
    </Badge>
  )
}

// ------------------------------------------------------------------ channel icons
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0 0 12.04 2Zm.01 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  )
}

const isGmail = (a?: string | null) => !!a && /@(gmail|googlemail)\.com$/i.test(a.trim())

export function Logo({ name, className }: { name: 'gmail' | 'whatsapp' | 'slack' | 'outlook' | 'zoho' | 'instagram' | 'telegram' | 'messenger' | 'webhooks' | 'claude' | 'google' | 'intercom' | 'zendesk' | 'hubspot'; className?: string }) {
  const file = { gmail: 'google-gmail', whatsapp: 'whatsapp-icon', slack: 'slack-icon', outlook: 'microsoft-icon', zoho: 'zoho', instagram: 'instagram-icon',
    telegram: 'telegram', messenger: 'messenger', webhooks: 'webhooks', claude: 'claude-icon', google: 'google-icon', intercom: 'intercom-icon', zendesk: 'zendesk-icon', hubspot: 'hubspot' }[name]
  return <img src={`/logos/${file}.svg`} alt="" className={cx('object-contain', className ?? 'size-4')} draggable={false} />
}

// Small square channel mark. Email from a Gmail address shows the Gmail logo.
export function ChannelIcon({ type, size = 'md', address }: { type: ChannelType; size?: 'sm' | 'md' | 'lg'; address?: string | null }) {
  const box = size === 'sm' ? 'size-5 rounded-md' : size === 'lg' ? 'size-10 rounded-xl' : 'size-8 rounded-lg'
  const ic = size === 'sm' ? 'size-3' : size === 'lg' ? 'size-5' : 'size-4'
  const frame = cx(box, 'grid place-items-center bg-white ring-1 ring-inset ring-ink-200/80')
  if (type === 'whatsapp') return <span className={frame}><Logo name="whatsapp" className={ic} /></span>
  if (type === 'email' && isGmail(address)) return <span className={frame}><Logo name="gmail" className={ic} /></span>
  if (type === 'email') return <span className={cx(box, 'grid place-items-center bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200/70')}><Mail className={ic} /></span>
  return <span className={cx(box, 'grid place-items-center bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-200/70')}><FlaskConical className={ic} /></span>
}

export function ChannelLogo({ ch }: { ch: Channel }) {
  if (ch.type === 'whatsapp') return <Logo name="whatsapp" className="size-5" />
  if (ch.type === 'email') {
    const a = (ch.address || '').toLowerCase()
    if (isGmail(a)) return <Logo name="gmail" className="size-5" />
    if (/outlook|hotmail|live\.com|office365/.test(a)) return <Logo name="outlook" className="size-5" />
    if (/zoho/.test(a)) return <Logo name="zoho" className="size-5" />
    return <Mail className="size-5 text-sky-600" />
  }
  return <FlaskConical className="size-5 text-violet-600" />
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const hue = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full text-[12px] font-semibold', className ?? 'size-9')}
      style={{ background: `hsl(${hue} 70% 94%)`, color: `hsl(${hue} 45% 32%)` }}>
      {initials}
    </span>
  )
}

// ------------------------------------------------------------------ form
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  )
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx('h-9 w-full rounded-lg bg-white px-3 text-sm text-ink-900 ring-1 ring-ink-200 placeholder:text-ink-400',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow', props.className)}
    />
  )
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx('w-full rounded-lg bg-white px-3 py-2.5 text-sm leading-relaxed text-ink-900 ring-1 ring-ink-200 placeholder:text-ink-400',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow', props.className)}
    />
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-ink-400', className ?? 'size-5')} />
}

// ------------------------------------------------------------------ modal
export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('fade-up relative w-full rounded-2xl bg-white shadow-2xl shadow-ink-900/10 ring-1 ring-ink-200', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X className="size-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 scroll-thin">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-3.5 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ toast
type ToastT = { id: number; text: string; tone: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, text, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div key={t.id} className="fade-up pointer-events-auto flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm text-white shadow-xl">
            {t.tone === 'ok' ? <CheckCircle2 className="size-4 text-emerald-400" /> : <AlertTriangle className="size-4 text-amber-400" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-200 bg-white px-1 font-mono text-[10.5px] text-ink-500 shadow-[0_1px_0_var(--color-ink-200)]">{children}</kbd>
}
