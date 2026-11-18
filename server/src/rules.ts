// Deterministic parts of the pipeline. No model calls here.
import type { Category, Flag, InMessage, Lane, NonQualifying, Team, Urgency } from './types.ts'

// ---------- 1. PII masking ----------
const HEALTH_TERMS = [
  'diabetes', 'diabetic', 'cancer', 'hiv', 'aids', 'pregnant', 'pregnancy', 'depression', 'anxiety disorder',
  'chemotherapy', 'abortion', 'std', 'hepatitis', 'epilepsy', 'schizophrenia', 'bipolar', 'adhd', 'autism',
  'miscarriage', 'ivf', 'psychiatric', 'antidepressant', 'herpes',
]

export function maskPII(text: string, senderEmail?: string): { text: string; count: number } {
  let count = 0
  let out = text || ''
  const sender = (senderEmail || '').toLowerCase()
  const rep = (re: RegExp, token: string, keep?: (m: string) => boolean) => {
    out = out.replace(re, (m) => {
      if (keep && keep(m)) return m
      count++
      return token
    })
  }
  // IBAN-like (before cards / phones)
  rep(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, '[iban]')
  // card numbers: 13-19 digits with optional spaces/dashes
  rep(/\b(?:\d[ -]?){12,18}\d\b/g, '[card]', (m) => !luhn(m.replace(/\D/g, '')) && m.replace(/\D/g, '').length < 15)
  // emails except sender
  rep(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]', (m) => m.toLowerCase() === sender)
  // dates of birth: "DOB", "born on", "date of birth" followed by a date
  rep(/\b(?:dob|d\.o\.b\.?|date of birth|born on|birthday)\s*[:\-]?\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/gi, '[dob]')
  // phone numbers: +country or 7+ digits with separators
  rep(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, '[phone]', (m) => {
    const digits = m.replace(/\D/g, '')
    if (digits.length < 9) return true // too short; likely an order number / time / price
    if (/^(19|20)\d{2}$/.test(digits)) return true
    return false
  })
  // health terms
  const healthRe = new RegExp(`\\b(?:${HEALTH_TERMS.map((t) => t.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi')
  rep(healthRe, '[health]')
  return { text: out, count }
}

function luhn(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alt = !alt
  }
  return digits.length >= 13 && sum % 10 === 0
}

// ---------- 2. Prompt-injection detection ----------
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/ignore (?:all |any |the )?(?:previous|prior|above|earlier) (?:instructions|prompts|messages|rules)/i, 'ignore previous instructions'],
  [/disregard (?:all |any |the )?(?:previous|prior|above|earlier|your) (?:instructions|prompts|rules)/i, 'disregard instructions'],
  [/forget (?:all |your |the )?(?:previous |prior )?(?:instructions|rules)/i, 'forget instructions'],
  [/\byou are (?:an? )?(?:ai|a\.i\.|language model|llm|chatbot|assistant)\b/i, 'you are an AI'],
  [/system prompt/i, 'system prompt'],
  [/\bapprove (?:a |the |my |this )?(?:full )?refund/i, 'approve a refund'],
  [/as the (?:ai |support )?assistant,? you (?:must|should|will)/i, 'as the assistant you must'],
  [/\b(?:new|updated) instructions\s*:/i, 'new instructions'],
  [/\bdeveloper mode\b|\bjailbreak\b|\bDAN\b/, 'jailbreak'],
  [/<\/?(?:system|assistant|instructions?)>/i, 'fake role tags'],
  [/\bact as (?:an? )?(?:admin|administrator|system|developer)/i, 'act as admin'],
  [/reveal (?:your |the )?(?:instructions|prompt|api key|secrets?)/i, 'reveal instructions'],
  [/(?:grant|give) (?:me )?(?:admin|full) access/i, 'grant access'],
]

export function detectInjection(text: string): string[] {
  const hits: string[] = []
  for (const [re, label] of INJECTION_PATTERNS) if (re.test(text || '')) hits.push(label)
  return hits
}

// ---------- 3. Prefilter ----------
export function prefilter(msg: InMessage): { qualifies: false; reason: NonQualifying; why: string } | null {
  const from = (msg.from_address || '').toLowerCase()
  const h: Record<string, string> = {}
  for (const [k, v] of Object.entries(msg.headers || {})) h[k.toLowerCase()] = String(v)
  if (/(?:^|[._+-])(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?)@/.test(from) || /^mailer-daemon/.test(from)) {
    return { qualifies: false, reason: 'automated', why: 'Sent from a no-reply / system address' }
  }
  if (h['auto-submitted'] && h['auto-submitted'].toLowerCase() !== 'no') {
    return { qualifies: false, reason: 'automated', why: 'Auto-Submitted header present' }
  }
  if (h['list-unsubscribe'] || h['list-id']) {
    return { qualifies: false, reason: 'newsletter', why: 'Mailing-list header (List-Unsubscribe)' }
  }
  const t = `${msg.subject || ''}\n${msg.text || ''}`
  if (/\b(?:verification|confirmation|security|one[- ]time|login|auth(?:entication)?)\s+(?:code|pin|password)\b|\bOTP\b|\byour code is\b/i.test(t) && /\b\d{4,8}\b/.test(t)) {
    return { qualifies: false, reason: 'automated', why: 'Looks like a one-time / verification code' }
  }
  if (/\b(?:seo|backlinks?|rank (?:#|number )?1 on google|first page of google|guest post(?:ing)?|dear (?:website|site) owner|link building|domain authority)\b/i.test(t)) {
    return { qualifies: false, reason: 'spam', why: 'Looks like SEO / marketing spam' }
  }
  if (/\bunsubscribe\b/i.test(t) && /\b(?:newsletter|view (?:this|in) (?:email|browser)|you(?:'re| are) receiving this)\b/i.test(t)) {
    return { qualifies: false, reason: 'newsletter', why: 'Newsletter footer (unsubscribe)' }
  }
  return null
}

// ---------- Fallback classifier (AI unavailable) ----------
const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ['data_privacy', /\b(?:gdpr|delete (?:my|all) (?:data|account)|personal data|data (?:export|request|deletion)|privacy|right to be forgotten|dsar|hipaa)\b/i],
  ['refund', /\b(?:refund|money back|chargeback|reimburse)\b/i],
  ['cancellation', /\b(?:cancel (?:my|our) (?:subscription|plan|account)|cancellation|close (?:my|our) account|downgrade)\b/i],
  ['account_access', /\b(?:can'?t log ?in|cannot log ?in|locked out|password reset|reset (?:my )?password|2fa|two[- ]factor|login)\b/i],
  ['billing', /\b(?:invoice|charged|billing|payment|card|subscription|plan|price|vat|receipt)\b/i],
  ['bug', /\b(?:bug|broken|not working|doesn'?t work|error|crash|glitch|wrong time|duplicate)\b/i],
  ['feature_request', /\b(?:feature|would be (?:great|nice)|could you add|please add|wish|suggestion)\b/i],
  ['how_to', /\b(?:how (?:do|can|to)|where (?:do|can|is)|is it possible|can i|set ?up|configure)\b/i],
]

export function teamFor(category: Category | null): Team | null {
  switch (category) {
    case 'billing': case 'refund': case 'cancellation': return 'billing'
    // Support reproduces bugs first; engineering only owns outages (and any P1, set in decideLane).
    case 'outage': return 'engineering'
    case 'bug': return 'support'
    case 'data_privacy': return 'privacy'
    case 'feature_request': return 'success'
    case 'how_to': case 'account_access': case 'other': return 'support'
    default: return null
  }
}

export function detectLanguage(text: string): string {
  const t = text || ''
  if (/[가-힯]/.test(t)) return 'ko'
  if (/[぀-ヿ]/.test(t)) return 'ja'
  if (/[一-鿿]/.test(t)) return 'zh'
  if (/[؀-ۿ]/.test(t)) return /[ٹڈڑںھہے]/.test(t) ? 'ur' : 'ar'
  if (/[Ѐ-ӿ]/.test(t)) return 'ru'
  if (/[ऀ-ॿ]/.test(t)) return 'hi'
  const w = ` ${t.toLowerCase()} `
  const score = (words: string[]) => words.reduce((n, x) => n + (w.includes(` ${x} `) ? 1 : 0), 0)
  const cands: Array<[string, number]> = [
    ['es', score(['el', 'la', 'que', 'por', 'para', 'hola', 'gracias', 'mi', 'no', 'cita', 'pero', 'con'])],
    ['de', score(['der', 'die', 'das', 'und', 'ich', 'nicht', 'mit', 'ist', 'bitte', 'danke', 'wir'])],
    ['fr', score(['le', 'la', 'les', 'et', 'je', 'pas', 'pour', 'bonjour', 'merci', 'nous', 'est', 'mon'])],
    ['pt', score(['o', 'a', 'que', 'não', 'para', 'obrigado', 'olá', 'com', 'meu', 'minha', 'é'])],
    ['it', score(['il', 'che', 'non', 'per', 'grazie', 'ciao', 'sono', 'mio', 'della', 'è'])],
    ['nl', score(['de', 'het', 'een', 'en', 'niet', 'ik', 'wij', 'bedankt', 'mijn', 'is'])],
    ['en', score(['the', 'and', 'is', 'to', 'i', 'my', 'you', 'we', 'it', 'not', 'can', 'please', 'our', 'for'])],
  ]
  cands.sort((a, b) => b[1] - a[1])
  return cands[0][1] > 0 ? cands[0][0] : 'en'
}

export function detectSentiment(text: string): 'angry' | 'negative' | 'neutral' | 'positive' {
  const t = text || ''
  const caps = (t.match(/\b[A-Z]{4,}\b/g) || []).length
  if (/\b(?:unacceptable|ridiculous|furious|outraged|scam|worst|lawyer|sue|disgusting|fed up|wtf|joke)\b/i.test(t) || caps >= 3 || /!!+/.test(t)) return 'angry'
  if (/\b(?:frustrat|disappoint|annoy|unhappy|problem|issue|broken|not working|again)\w*/i.test(t)) return 'negative'
  if (/\b(?:thanks|thank you|love|great|awesome|appreciate)\b/i.test(t)) return 'positive'
  return 'neutral'
}

export function ruleClassify(text: string, subject: string | null) {
  const t = `${subject || ''}\n${text || ''}`
  let category: Category = 'other'
  if (isServiceDown(t) && !/\b(?:gdpr|delete (?:my|all) (?:data|account)|personal data)\b/i.test(t)) category = 'outage'
  else for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(t)) { category = cat; break }
  const sentiment = detectSentiment(t)
  let urgency: Urgency = category === 'outage' ? 'P1' : (category === 'bug' || category === 'account_access' || category === 'refund') ? 'P2' : (category === 'feature_request' ? 'P4' : 'P3')
  const summary = (subject && subject.trim()) || (text || '').replace(/\s+/g, ' ').trim().slice(0, 100)
  return {
    qualifies: true, not_qualifying_reason: null as NonQualifying | null,
    category, urgency, sentiment, language: detectLanguage(text), summary,
    search_query: `${subject || ''} ${(text || '').slice(0, 300)}`.trim(),
  }
}

// ---------- 5. Urgency floor ----------
const SERVICE = '(?:site|website|page|app|booking|booking page|system|server|slotwise|dashboard|calendar)'
const OUTAGE_EVERYONE = /\b(?:no ?one|nobody|none of (?:our|my|the) \w+)\b.{0,40}\b(?:can|could|is|are|has|have|been able|able)\b.{0,20}\b(?:book|log ?in|sign ?in|access|load|open)|\b(?:all (?:of )?(?:our|my|the) \w+|everyone|everybody)\b.{0,40}\b(?:can'?t|cannot|can not|unable|not able|have(?:n'?t| not) been able|isn'?t|is not|not)\b.{0,20}\b(?:book|log ?in|sign ?in|access|load|open)/
export function isServiceDown(text: string): boolean {
  const t = (text || '').toLowerCase().replace(/no-?shows? (?:are|is|went|have gone) down/g, '')
  return new RegExp(`\\b${SERVICE}\\b.{0,30}\\b(?:is|went|goes|has gone|seems|appears)(?: to be)? (?:completely |totally )?down\\b|\\b${SERVICE}\\b.{0,30}\\bdown for\\b|\\b(?:booking page|website|site|server) down\\b|\\bdown for (?:everyone|all)\\b`).test(t)
    || /\boutage\b|\b50[0234] (?:error|internal|bad gateway|service)|\berror 50[0234]\b|\b(?:showing|shows|getting|throws?) an error for (?:everyone|all)/.test(t)
    || OUTAGE_EVERYONE.test(t)
}
const RANK: Record<Urgency, number> = { P1: 1, P2: 2, P3: 3, P4: 4 }
export function urgencyFloor(text: string, current: Urgency | null, sentiment: string, category: Category | null): { urgency: Urgency | null; reasons: string[] } {
  const t = (text || '').toLowerCase()
  const reasons: string[] = []
  let u: Urgency | null = current
  const raise = (to: Urgency, why: string) => {
    if (!u || RANK[to] < RANK[u]) { u = to; reasons.push(why) }
  }
  if (OUTAGE_EVERYONE.test(t) || /\b(?:patients|clients|customers) (?:can'?t|cannot|can not|are unable to) book\b/.test(t)) raise('P1', 'Many customers cannot book / log in — revenue impact')
  if (isServiceDown(t)) raise('P1', 'Service appears down')
  if (/\bnot loading\b|\bwon'?t load\b/.test(t)) raise('P2', 'Something is not loading')
  if (sentiment === 'angry' && category === 'refund') raise('P2', 'Angry customer asking for a refund')
  return { urgency: u, reasons }
}

// ---------- 8. Draft check ----------
const PROMISE_WORDS = /\b(?:refund(?:ed)?|credit(?:ed)?|free month|compensat\w*|guarantee\w*|by tomorrow|within 24 hours|we will fix|i promise|we promise|discount)\b/i

export function checkDraft(draft: string, opts: { articles: string[]; message: string; language: string; usedArticleIds: string[] }): Flag[] {
  const leak = draft.match(/\b(the |these |our )?(articles?|help[- ]?cent(er|re)|knowledge[- ]?base|documentation I (have|was given))\b|\bas an AI\b|\b(language model|I don'?t have (any )?information)\b/i)
  const placeholder = draft.match(/\[(?!card\]|phone\]|email\])[^\]\n]{1,30}\]|<[a-z ]{2,20}>/i)
  const early: Flag[] = []
  if (leak) early.push({ kind: 'policy', text: `Draft talks about its own sources ("${leak[0]}"). Rewrite it the way an agent would say it.` })
  if (placeholder) early.push({ kind: 'policy', text: `Draft contains a placeholder (${placeholder[0]}). Fill it in or remove it.` })

  const flags: Flag[] = []
  const ground = `${opts.articles.join('\n')}\n${opts.message}`.toLowerCase()
  const groundNorm = ground.replace(/[,\s]/g, '')
  // URLs
  for (const url of draft.match(/https?:\/\/[^\s)>\]]+/gi) || []) {
    const u = url.replace(/[.,;:!?]+$/, '').toLowerCase()
    if (!ground.includes(u)) flags.push({ kind: 'unsupported_fact', text: `Link not in sources: ${u}` })
  }
  // prices
  for (const p of draft.match(/[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:usd|eur|gbp|dollars?)/gi) || []) {
    const n = p.replace(/[^\d.]/g, '').replace(/\.$/, '')
    if (n && !groundNorm.includes(n)) flags.push({ kind: 'unsupported_fact', text: `Price not in sources: ${p.trim()}` })
  }
  // dates
  for (const d of draft.match(/\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/gi) || []) {
    if (!ground.includes(d.toLowerCase())) flags.push({ kind: 'unsupported_fact', text: `Date not in sources: ${d}` })
  }
  // other numbers (2+ digits), e.g. "48 hours", "30 days"
  const seen = new Set<string>()
  for (const m of draft.replace(/https?:\/\/\S+/g, '').match(/\b\d{2,}\b/g) || []) {
    if (seen.has(m)) continue
    seen.add(m)
    if (!groundNorm.includes(m) && !flags.some((f) => f.text.includes(m))) flags.push({ kind: 'unsupported_fact', text: `Number not in sources: ${m}` })
  }
  const pm = draft.match(PROMISE_WORDS)
  if (pm) flags.push({ kind: 'promise', text: `Draft may promise something: "${pm[0]}"` })
  if (!opts.usedArticleIds.length) flags.push({ kind: 'no_source', text: 'Draft does not cite any knowledge-base article' })
  const lang = detectLanguage(draft)
  const expected = (opts.language || 'en').toLowerCase().slice(0, 2)
  // Only flag script-level / strong mismatches (our detector is heuristic)
  const scriptLangs = ['ko', 'ja', 'zh', 'ar', 'ur', 'ru', 'hi']
  if (lang !== expected && (scriptLangs.includes(lang) || scriptLangs.includes(expected) || (expected !== 'en' && lang === 'en') || (expected === 'en' && lang !== 'en' && draft.length > 80))) {
    flags.push({ kind: 'language', text: `Draft language (${lang}) differs from customer (${expected})` })
  }
  return [...early, ...flags]
}

// ---------- 9. Lane decision ----------
export type LaneInput = {
  qualifies: boolean
  category: Category | null
  urgency: Urgency | null
  sentiment: string
  injection: string[]
  flags: Flag[]
  confidence: 'high' | 'medium' | 'low'
  sources: { id: string }[]
  mode: 'ai' | 'rules'
  text: string
  needs_human?: boolean
  needs_human_reason?: string
}

export function decideLane(i: LaneInput): { lane: Lane | null; team: Team | null; reasons: string[] } {
  if (!i.qualifies) return { lane: null, team: null, reasons: [] }
  const reasons: string[] = []
  let team = teamFor(i.category)
  const legal = /\b(?:lawyer|attorney|legal action|sue|lawsuit|solicitor|court|small claims)\b/i.test(i.text || '')
  if (i.injection.length) { reasons.push(`Possible prompt injection: ${i.injection.join(', ')}`); team = team ?? 'support' }
  if (i.category === 'data_privacy') { reasons.push('Data-privacy request — privacy team only'); team = 'privacy' }
  if (i.category === 'refund') { reasons.push('Refund decisions are made by billing'); team = 'billing' }
  if (i.urgency === 'P1') { reasons.push(i.category === 'outage' ? 'P1 outage — engineering on-call' : 'P1 urgency — needs a person now'); if (i.category === 'outage' || !team || team === 'support') team = 'engineering' }
  if (legal) { reasons.push('Legal threat mentioned'); team = team === 'support' || !team ? 'success' : team }
  if (i.sentiment === 'angry' && i.category === 'cancellation') { reasons.push('Angry customer wants to cancel — retention'); team = 'success' }
  if (reasons.length) return { lane: 'escalated', team, reasons }

  if (i.mode === 'rules') reasons.push('AI unavailable — classified by keyword rules, no draft')
  for (const f of i.flags) if (f.kind !== 'ai_unavailable') reasons.push(f.text)
  if (i.mode === 'ai' && i.confidence !== 'high') reasons.push(`Model confidence is ${i.confidence}`)
  if (i.mode === 'ai' && !i.sources.length) reasons.push('No knowledge-base article found')
  if (i.needs_human) reasons.push(`Model suggests a human look${i.needs_human_reason ? `: ${i.needs_human_reason}` : ''}`)
  if (reasons.length) return { lane: 'review', team, reasons }
  return { lane: 'reply', team, reasons: ['Grounded draft, no flags, high confidence'] }
}
