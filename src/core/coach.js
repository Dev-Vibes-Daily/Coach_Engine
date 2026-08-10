// src/core/coach.js — SHARED FOUNDATION
// The AI machinery: call Claude, parse JSON, fill prompt templates.
// Identical for every coach; only the prompt TEXT (from config) differs.

const API_URL = '/api/anthropic/v1/messages'
const MODEL   = 'claude-sonnet-4-6'

async function callClaude(prompt) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`API error (${res.status})`)
  const data = await res.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}

// Tolerant JSON extraction — strips markdown fences and stray prose.
function parseJSON(text) {
  let s = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const i = s.indexOf('{'), j = s.lastIndexOf('}')
  if (i > -1 && j > i) s = s.slice(i, j + 1)
  return JSON.parse(s)
}

async function claudeJSON(prompt) { return parseJSON(await callClaude(prompt)) }

// Replace {placeholders} in a prompt template. Unknown keys are left intact.
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`))
}

// ── Per-entry coaching ────────────────────────────────────────────────────────
// Placeholders available to config.entryPrompt: {coachVoice} {entry} {todayLog} {history}
export async function getEntryResponse(config, state, entryText) {
  const todayLog = state.today.length
    ? state.today.map(e => `- ${e.text}`).join('\n')
    : '(this is the first entry this stretch)'
  const history = state.recentDays?.length
    ? state.recentDays.map(d => `${d.label}: ${d.summary}`).join('\n')
    : '(no earlier stretches yet)'

  const prompt = fill(config.entryPrompt, {
    coachVoice: config.coachVoice,
    entry: entryText,
    todayLog,
    history,
  })
  return claudeJSON(prompt)
}

// ── Periodic review ───────────────────────────────────────────────────────────
// Placeholders available to config.reviewPrompt: {coachVoice} {fullLog} {count}
export async function getReview(config, state) {
  const fullLog = state.today.map(e => {
    const parts = (config.parts || [])
      .map(p => (e.parts?.[p.key] ? `${p.label}: ${e.parts[p.key]}` : ''))
      .filter(Boolean).join(' · ')
    return `- ${e.text}` + (parts ? ` [${parts}]` : '')
  }).join('\n')

  const prompt = fill(config.reviewPrompt, {
    coachVoice: config.coachVoice,
    fullLog,
    count: String(state.today.length),
  })
  return claudeJSON(prompt)
}

// ── Follow-up reaction ────────────────────────────────────────────────────────
// Placeholders available to config.followUpPrompt: {coachVoice} {focus} {tried} {happened}
export async function getFollowUpReaction(config, archivedReview, tried, happened) {
  const prompt = fill(config.followUpPrompt, {
    coachVoice: config.coachVoice,
    focus: archivedReview.focus || '(no focus recorded)',
    tried, happened,
  })
  return claudeJSON(prompt)
}
