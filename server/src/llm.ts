import Anthropic from '@anthropic-ai/sdk'

export type Usage = { input: number; output: number; cost_usd: number }
export type JsonResult<T> = { data: T; usage: Usage; model: string }

export function aiProvider(): 'anthropic' | 'openrouter' | 'none' {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENROUTER_API_KEY) return 'openrouter'
  return 'none'
}

export function modelName(): string {
  const p = aiProvider()
  if (p === 'anthropic') return process.env.MODEL || 'claude-sonnet-5-5'
  if (p === 'openrouter') return process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5.5'
  return 'rules'
}

// USD per million tokens [input, output]
const PRICES: Array<[RegExp, number, number]> = [
  [/opus/i, 4, 20],
  [/haiku/i, 0.1, 0.5],
  [/sonnet/i, 2, 10],
]

export function cost(model: string, input: number, output: number): number {
  const p = PRICES.find(([re]) => re.test(model)) ?? PRICES[2]
  return (input * p[1] + output * p[2]) / 1_000_000
}

let client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 60_000 })
  return client
}

export async function json<T>(system: string, user: string, schema: object, opts?: { maxTokens?: number }): Promise<JsonResult<T>> {
  const provider = aiProvider()
  const maxTokens = opts?.maxTokens ?? 1500
  if (provider === 'none') throw new Error('AI unavailable: no API key configured')

  if (provider === 'anthropic') {
    const model = process.env.MODEL || 'claude-sonnet-5-5'
    const res: any = await anthropic().messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    } as any)
    if (res.stop_reason === 'refusal') throw new Error('Model refused the request')
    if (res.stop_reason === 'max_tokens') throw new Error('Model output truncated (max_tokens)')
    const block = (res.content || []).find((b: any) => b.type === 'text')
    if (!block) throw new Error('No text block in model response')
    const data = JSON.parse(block.text) as T
    const input = res.usage?.input_tokens ?? 0
    const output = res.usage?.output_tokens ?? 0
    return { data, usage: { input, output, cost_usd: cost(model, input, output) }, model }
  }

  // OpenRouter fallback
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5.5'
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 60_000)
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } },
        }),
      }).finally(() => clearTimeout(timer))
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        const err = new Error(`OpenRouter HTTP ${r.status}: ${body.slice(0, 200)}`)
        if (r.status >= 500 || r.status === 429) { lastErr = err; await new Promise((s) => setTimeout(s, 1000 * (attempt + 1))); continue }
        throw err
      }
      const j: any = await r.json()
      const choice = j.choices?.[0]
      if (choice?.finish_reason === 'length') throw new Error('Model output truncated (max_tokens)')
      let content: string = choice?.message?.content ?? ''
      content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
      const data = JSON.parse(content) as T
      const input = j.usage?.prompt_tokens ?? 0
      const output = j.usage?.completion_tokens ?? 0
      const c = typeof j.usage?.cost === 'number' ? j.usage.cost : cost(model, input, output)
      return { data, usage: { input, output, cost_usd: c }, model }
    } catch (e) {
      lastErr = e
      if (e instanceof SyntaxError) throw e
      if (attempt === 2) break
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
