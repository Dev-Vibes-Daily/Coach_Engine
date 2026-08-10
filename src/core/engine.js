// src/core/engine.js — SHARED FOUNDATION
// The coaching loop: entries accumulate, a review snapshots to the archive,
// follow-ups track whether the focus stuck. Fully domain-agnostic — every
// label, prompt, and response part comes from the config. No domain fields.

import { saveState, archiveSession, loadArchive, saveArchive } from './storage.js'

export function freshState() {
  return {
    today: [],           // entries this stretch
    recentDays: [],      // optional prior-stretch summaries (pattern context)
    reviewResult: null,
    phase: 'log',
  }
}

export function hydrateState(saved) {
  return Object.assign({}, freshState(), saved)
}

// Persist only once there's something worth saving.
export function worthSaving(state) {
  return Array.isArray(state.today) && state.today.length > 0
}

// Store an entry: the user's text + the coach's parts (a plain object keyed
// by the config's part keys, e.g. { frame, anticipate, ask }). Nothing
// domain-specific lives here — `parts` is whatever this coach returns.
export function addEntry(state, text, parts) {
  const now = new Date()
  state.today.push({
    text,
    ts: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    date: now.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    parts: parts || {},
  })
  saveState(state)
}

// Archive the current stretch alongside its review.
export function snapshotReview(state, review) {
  const first = state.today[0]?.date || ''
  const last = state.today[state.today.length - 1]?.date || ''
  const range = first === last ? first : `${first} – ${last}`
  archiveSession({
    id: 'review-' + Date.now(),
    completedAt: new Date().toISOString(),
    range,
    entryCount: state.today.length,
    entries: state.today.map(e => ({ text: e.text, ts: e.ts, date: e.date })),
    patterns: review.patterns || '',
    working: review.working || '',
    focus: review.focus || '',
    followUps: [],
    followUpStatus: 'awaiting',
  })
}

// The most-impactful verdict wins for the archived stretch's badge.
const RANK = { slipped: 3, stuck: 2, mixed: 1, awaiting: 0 }

export function addFollowUp(idx, entry) {
  const arr = loadArchive()
  const d = arr[idx]; if (!d) return null
  d.followUps.push(entry)
  d.followUpStatus = d.followUps.reduce((best, f) => RANK[f.verdict] > RANK[best] ? f.verdict : best, 'awaiting')
  saveArchive(arr)
  return d
}

// Clear the current stretch (its review is already archived).
export function startFresh(state) {
  state.today = []
  state.reviewResult = null
  state.phase = 'log'
}
