import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

export const COOKIE = 'fd_session'
const MAX_AGE = 7 * 24 * 3600

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@slotwise.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'frontdesk'
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.warn(`[auth] WARNING: ADMIN_EMAIL/ADMIN_PASSWORD not set; using defaults (${ADMIN_EMAIL} / frontdesk). Set them in .env.`)
}
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
if (!process.env.SESSION_SECRET) console.warn('[auth] SESSION_SECRET not set; sessions reset on restart.')

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url')

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function checkCredentials(email: string, password: string): boolean {
  return safeEq(String(email || '').trim().toLowerCase(), ADMIN_EMAIL.toLowerCase()) && safeEq(String(password || ''), ADMIN_PASSWORD)
}

export function issueSession(c: Context, email: string) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url')
  setCookie(c, COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIE !== '1',
  })
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' })
}

export function sessionEmail(c: Context): string | null {
  const raw = getCookie(c, COOKIE)
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof d.exp !== 'number' || d.exp < Date.now()) return null
    return String(d.email)
  } catch { return null }
}

export async function requireAuth(c: Context, next: Next) {
  const p = c.req.path
  if (p === '/api/login' || p === '/api/health') return next()
  if (!sessionEmail(c)) return c.json({ error: 'Not signed in' }, 401)
  return next()
}
