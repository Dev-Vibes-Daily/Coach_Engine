// src/core/ui.js — SHARED FOUNDATION
// Renders the whole app from config + engine state. Domain-agnostic:
// the coach's response parts come from config.parts, nothing is hardcoded.

import {
  freshState, hydrateState, worthSaving, addEntry,
  snapshotReview, addFollowUp, startFresh,
} from './engine.js'
import { initStorage, saveState, clearState, loadState, loadArchive } from './storage.js'
import { getEntryResponse, getReview, getFollowUpReaction } from './coach.js'

let CFG = null, S = null
let viewingReview = null, viewingIdx = null
const retries = {}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function loadingHTML(m) { return `<div class="loading"><div class="spinner"></div>${m}</div>` }
function errorHTML(id, m) { return `<div class="errbox">Something went wrong: ${esc(m)}<br><button onclick="window._retry('${id}')">Try again</button></div>` }
function fmtDate(iso) { return new Date(iso).toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }) }
function badgeClass(s) { return { awaiting:'awaiting', stuck:'stuck', slipped:'slipped', mixed:'mixed' }[s] || 'awaiting' }
function badgeLabel(s) { return { awaiting:'Awaiting follow-up', stuck:'Stuck', slipped:'Slipped', mixed:'Mixed' }[s] || 'Awaiting' }
window._retry = id => { if (retries[id]) retries[id]() }

const VIEWS = ['log', 'review', 'past', 'archived']
function show(v) {
  S.phase = v
  VIEWS.forEach(x => document.getElementById('view-' + x)?.classList.toggle('hidden', x !== v))
  renderSidebar()
}
window.show = show

// ── Shell ─────────────────────────────────────────────────────────────────────
function buildShell() {
  const principles = (CFG.readFirstPrinciples || []).map(p =>
    `<div class="principle"><b>${esc(p.heading)}</b> ${esc(p.body)}</div>`
  ).join('')

  document.getElementById('app').innerHTML = `
<div class="wrap">
  <header class="top">
    <h1>${esc(CFG.name)}</h1>
    <div class="sub">${esc(CFG.subtitle)}</div>
    <p class="tag">${esc(CFG.tagline)}</p>
  </header>

  ${CFG.disclaimer ? `<div class="disclaimer">${CFG.disclaimer}</div>` : ''}

  ${CFG.readFirstPrinciples?.length ? `
  <details class="readfirst" id="readfirst" open>
    <summary>${esc(CFG.readFirstTitle || 'How this works')}</summary>
    <div class="body">${principles}</div>
  </details>` : ''}

  <div class="grid">
    <main id="stage">
      <!-- LOG VIEW -->
      <section id="view-log" class="card">
        <div id="logIntro" style="margin-bottom:14px;">
          <p style="color:var(--ink-soft);">${esc(CFG.logPrompt)}</p>
        </div>
        <div id="entries"></div>
        <div id="logStatus"></div>
        <div class="answerarea" style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
          <label class="field">${esc(CFG.logLabel)}</label>
          <textarea id="entryInput" placeholder="${esc(CFG.logPlaceholder)}"></textarea>
          <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
            <button id="btnLog" onclick="window._logEntry()">Log it</button>
            <button class="secondary" id="btnReview" onclick="window._goReview()">${esc(CFG.reviewButton)}</button>
          </div>
        </div>
      </section>

      <!-- REVIEW VIEW -->
      <section id="view-review" class="card hidden">
        <h2 class="serif" style="margin-bottom:6px;">Your review</h2>
        <div id="reviewRange" style="color:var(--ink-soft);font-size:14px;margin-bottom:14px;"></div>
        <div id="reviewStatus"></div>
        <div id="reviewBox" class="review"></div>
        <hr class="rule">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="window._startFresh()">Start a fresh stretch</button>
          <button class="secondary" onclick="show('log');renderLog()">Back to logging</button>
        </div>
      </section>

      <!-- PAST REVIEWS -->
      <section id="view-past" class="card hidden">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <h2 class="serif" style="flex:1;">Past reviews</h2>
          <button class="secondary" onclick="show('log');renderLog()">Back</button>
        </div>
        <div id="pastList" class="pastlist"></div>
        <div id="pastEmpty" class="empty hidden">No reviews yet — log a stretch and review it.</div>
      </section>

      <!-- ARCHIVED REVIEW -->
      <section id="view-archived" class="card hidden">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
          <h2 class="serif" style="flex:1;">Review</h2>
          <button class="secondary" onclick="window._openPast()">Back to past reviews</button>
        </div>
        <div id="arRange" style="margin-bottom:14px;padding-bottom:12px;border-bottom:1.5px solid var(--ink);"></div>
        <div id="arReview" class="review" style="margin-bottom:12px;"></div>
        <hr class="rule">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <h3 class="serif" style="flex:1;">Follow-up log</h3>
          <span id="arBadge" class="badge"></span>
        </div>
        <div id="arFollowups"></div>
        <div class="fu-form">
          <b style="font-size:15px;">${esc(CFG.followUpQuestion)}</b>
          <label class="field" style="margin-top:10px;">${esc(CFG.followUpTriedLabel)}</label>
          <textarea id="fuTried" placeholder="${esc(CFG.followUpTriedPlaceholder)}" style="min-height:60px;"></textarea>
          <label class="field" style="margin-top:10px;">${esc(CFG.followUpHappenedLabel)}</label>
          <textarea id="fuHappened" placeholder="${esc(CFG.followUpHappenedPlaceholder)}" style="min-height:60px;"></textarea>
          <div style="margin-top:10px;"><button id="btnFU" onclick="window._submitFollowUp()">Submit &amp; get reaction</button></div>
          <div id="fuStatus"></div>
        </div>
      </section>
    </main>

    <aside class="side" id="sidebar">
      <div id="saveNotice" class="hidden" style="font-size:12.5px;color:#94402B;background:#F6E3DE;border:1px solid #94402B;border-radius:8px;padding:8px 12px;margin-bottom:14px;">Saving unavailable — this log lives in memory only.</div>
      <div class="card">
        <h3 class="serif">${esc(CFG.logLabel)}</h3>
        <div class="log-list" id="logList"><div class="empty">Nothing logged yet.</div></div>
      </div>
      <div class="card">
        <button class="quiet" onclick="window._openPast()">Past reviews</button>
        <span id="archiveBadge" style="font-size:13px;color:var(--ink-soft);margin-left:8px;"></span>
      </div>
    </aside>
  </div>
</div>`
}

// ── Rendering: log view ───────────────────────────────────────────────────────
function partsHTML(parts) {
  return (CFG.parts || []).map(p =>
    parts?.[p.key]
      ? `<div class="part"><span class="lbl ${esc(p.key)}">${esc(p.label)}</span>${esc(parts[p.key])}</div>`
      : ''
  ).join('')
}

function renderLog() {
  const wrap = document.getElementById('entries')
  if (!wrap) return
  if (!S.today.length) {
    wrap.innerHTML = `<div class="empty" style="padding:8px 0;">Your entries and ${esc(CFG.coachName || CFG.name)}'s notes will appear here as you log.</div>`
  } else {
    wrap.innerHTML = S.today.map(e => `
      <div class="log-entry">
        <div class="you"><div class="who"><span>You</span><span>${esc(e.ts)}</span></div>${esc(e.text)}</div>
        <div class="coach">${partsHTML(e.parts)}</div>
      </div>`).join('')
  }
  renderSidebar()
  wrap.scrollIntoView({ block: 'end' })
}

// ── Rendering: sidebar ────────────────────────────────────────────────────────
function renderSidebar() {
  if (!S) return
  const list = document.getElementById('logList')
  if (list) list.innerHTML = S.today.length
    ? S.today.map(e => `<div class="item"><div class="ts">${esc(e.ts)}</div>${esc(e.text)}</div>`).join('')
    : '<div class="empty">Nothing logged yet.</div>'
  renderArchiveBadge()
}

function renderArchiveBadge() {
  const arr = loadArchive()
  const el = document.getElementById('archiveBadge')
  if (el) el.textContent = arr.length ? `${arr.length} past review${arr.length === 1 ? '' : 's'}` : ''
}

// ── Handlers: logging ─────────────────────────────────────────────────────────
window._logEntry = async () => {
  const inp = document.getElementById('entryInput')
  const text = inp.value.trim()
  if (!text) return
  document.getElementById('btnLog').disabled = true
  document.getElementById('logStatus').innerHTML = loadingHTML(`${esc(CFG.coachName || CFG.name)} is reading that…`)
  retries['log'] = window._logEntry
  try {
    const parts = await getEntryResponse(CFG, S, text)
    addEntry(S, text, parts)
    inp.value = ''
    document.getElementById('logStatus').innerHTML = ''
    renderLog()
  } catch (e) {
    document.getElementById('logStatus').innerHTML = errorHTML('log', e.message)
  }
  document.getElementById('btnLog').disabled = false
}

// ── Handlers: review ──────────────────────────────────────────────────────────
window._goReview = async () => {
  if (!S.today.length) {
    document.getElementById('logStatus').innerHTML = '<div class="banner">Log at least one thing before reviewing.</div>'
    return
  }
  show('review')
  const first = S.today[0]?.date || ''
  const last = S.today[S.today.length - 1]?.date || ''
  const n = S.today.length
  document.getElementById('reviewRange').textContent =
    (first === last ? first : `${first} – ${last}`) + ` · ${n} entr${n === 1 ? 'y' : 'ies'}`
  const st = document.getElementById('reviewStatus')
  const box = document.getElementById('reviewBox')
  box.innerHTML = ''
  if (S.reviewResult) { renderReview(S.reviewResult); return }
  st.innerHTML = loadingHTML(`${esc(CFG.coachName || CFG.name)} is reviewing your entries…`)
  retries['review'] = window._goReview
  try {
    const j = await getReview(CFG, S)
    S.reviewResult = j
    saveState(S)
    st.innerHTML = ''
    renderReview(j)
    snapshotReview(S, j)
    renderArchiveBadge()
  } catch (e) { st.innerHTML = errorHTML('review', e.message) }
}

function renderReview(j) {
  document.getElementById('reviewBox').innerHTML = `
    <div class="part"><span class="lbl">Patterns</span>${esc(j.patterns)}</div>
    <div class="part"><span class="lbl">What's working</span>${esc(j.working)}</div>
    <div class="part"><span class="lbl">Focus for next stretch</span><div class="focus">${esc(j.focus)}</div></div>`
}

window._startFresh = () => {
  startFresh(S)
  clearState()
  document.getElementById('reviewBox').innerHTML = ''
  show('log')
  renderLog()
}

// ── Handlers: past reviews + follow-up ────────────────────────────────────────
window._openPast = () => {
  show('past')
  const arr = loadArchive()
  const list = document.getElementById('pastList')
  const empty = document.getElementById('pastEmpty')
  if (!arr.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return }
  empty.classList.add('hidden')
  list.innerHTML = arr.map((d, i) => `
    <div class="pastcard" onclick="window._openArchived(${i})">
      <div class="ptop">
        <div class="prange">${esc(d.range || 'Review')}</div>
        <span class="badge ${badgeClass(d.followUpStatus)}">${badgeLabel(d.followUpStatus)}</span>
      </div>
      <div class="meta">${d.entryCount} entr${d.entryCount === 1 ? 'y' : 'ies'} · Reviewed ${fmtDate(d.completedAt)}</div>
      <div class="meta" style="margin-top:6px;font-style:italic;">Focus: ${esc(d.focus || '—')}</div>
    </div>`).join('')
}

window._openArchived = (idx) => {
  const arr = loadArchive()
  const d = arr[idx]; if (!d) return
  viewingReview = d; viewingIdx = idx
  show('archived')
  document.getElementById('arRange').innerHTML =
    `<span style="font-size:11.5px;text-transform:uppercase;letter-spacing:.2em;font-weight:800;color:var(--moss);">${esc(d.range || 'Review')}</span>
     <div style="font-size:13px;color:var(--ink-soft);margin-top:4px;">${d.entryCount} entr${d.entryCount === 1 ? 'y' : 'ies'} · Reviewed ${fmtDate(d.completedAt)}</div>`
  document.getElementById('arReview').innerHTML = `
    <div class="part"><span class="lbl">Patterns</span>${esc(d.patterns)}</div>
    <div class="part"><span class="lbl">What's working</span>${esc(d.working)}</div>
    <div class="part"><span class="lbl">Focus</span><div class="focus">${esc(d.focus)}</div></div>`
  renderFollowUps(d)
}

function renderFollowUps(d) {
  const badge = document.getElementById('arBadge')
  if (badge) { badge.className = 'badge ' + badgeClass(d.followUpStatus); badge.textContent = badgeLabel(d.followUpStatus) }
  const el = document.getElementById('arFollowups')
  if (!el) return
  el.innerHTML = d.followUps?.length
    ? d.followUps.map(fu => `<div class="fu-entry"><div class="fu-meta">${esc(fmtDate(fu.at))}</div><div><b>Tried:</b> ${esc(fu.tried)}</div><div style="margin-top:4px;"><b>How it went:</b> ${esc(fu.happened)}</div>${fu.coach ? `<div class="fu-coach"><span class="badge ${badgeClass(fu.verdict)}" style="margin-bottom:5px;">${badgeLabel(fu.verdict)}</span><br>${esc(fu.coach)}</div>` : ''}</div>`).join('')
    : '<div class="empty" style="margin-bottom:10px;">No follow-up entries yet.</div>'
}

window._submitFollowUp = async () => {
  const tried = document.getElementById('fuTried').value.trim()
  const happened = document.getElementById('fuHappened').value.trim()
  if (!tried || !happened) { document.getElementById('fuStatus').innerHTML = '<div class="banner">Fill in both fields.</div>'; return }
  const st = document.getElementById('fuStatus')
  document.getElementById('btnFU').disabled = true
  st.innerHTML = loadingHTML(`${esc(CFG.coachName || CFG.name)} is reading your update…`)
  retries['fu'] = window._submitFollowUp
  try {
    const j = await getFollowUpReaction(CFG, viewingReview, tried, happened)
    const fu = { at: new Date().toISOString(), tried, happened, coach: j.reaction, verdict: j.verdict }
    viewingReview = addFollowUp(viewingIdx, fu)
    document.getElementById('fuTried').value = ''
    document.getElementById('fuHappened').value = ''
    st.innerHTML = ''
    renderFollowUps(viewingReview)
  } catch (e) { st.innerHTML = errorHTML('fu', e.message) }
  document.getElementById('btnFU').disabled = false
}

// ── Boot ──────────────────────────────────────────────────────────────────────
export function boot(config) {
  CFG = config
  document.title = CFG.name
  S = freshState()
  initStorage(CFG.name, worthSaving)
  buildShell()
  const saved = loadState()
  if (saved && Array.isArray(saved.today) && saved.today.length) {
    S = hydrateState(saved)
  }
  show('log')
  renderLog()
}
