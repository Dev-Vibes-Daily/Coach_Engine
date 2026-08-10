// src/core/storage.js — SHARED FOUNDATION
// localStorage persistence, keyed by coach name. worthSaving is domain-supplied.
// SHARED FOUNDATION — identical to The Dig's storage layer, with one
// generalization: the "worth saving yet?" check is now domain-supplied.
// localStorage persistence, keyed by domain name. Graceful degradation.

const CURRENT_SUFFIX = '-current'
const ARCHIVE_SUFFIX = '-archive'

let _domainKey = 'coaching-loop'
let _saveBroken = false
let _worthSaving = () => true   // domains can override via initStorage

/** Call once at startup. worthSaving(state) decides if there's anything to persist. */
export function initStorage(domainName, worthSaving) {
  _domainKey = domainName.toLowerCase().replace(/\s+/g, '-')
  if (typeof worthSaving === 'function') _worthSaving = worthSaving
}

function currentKey() { return _domainKey + CURRENT_SUFFIX }
function archiveKey()  { return _domainKey + ARCHIVE_SUFFIX }

function onStorageError(e) {
  console.warn('[storage] localStorage unavailable:', e?.message)
  _saveBroken = true
  const el = document.getElementById('saveNotice')
  if (el) el.classList.remove('hidden')
}

export function isSaveBroken() { return _saveBroken }

let _saveTimer = null

/** Debounced save — batches rapid changes into one write. */
export function saveState(state) {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    if (!_worthSaving(state)) return
    try {
      localStorage.setItem(currentKey(), JSON.stringify(state))
      _saveBroken = false
      const el = document.getElementById('saveNotice')
      if (el) el.classList.add('hidden')
    } catch (e) { onStorageError(e) }
  }, 150)
}

export function loadState() {
  try {
    const raw = localStorage.getItem(currentKey())
    return raw ? JSON.parse(raw) : null
  } catch (e) { onStorageError(e); return null }
}

export function clearState() {
  try { localStorage.removeItem(currentKey()) } catch (e) { /* graceful */ }
}

// ── Archive (session history + follow-ups) ───────────────────────────────────

export function loadArchive() {
  try {
    const raw = localStorage.getItem(archiveKey())
    return raw ? JSON.parse(raw) : []
  } catch (e) { onStorageError(e); return [] }
}

export function archiveSession(snapshot) {
  const arr = loadArchive()
  arr.unshift(snapshot)
  try { localStorage.setItem(archiveKey(), JSON.stringify(arr)) }
  catch (e) { onStorageError(e) }
}

export function saveArchive(arr) {
  try { localStorage.setItem(archiveKey(), JSON.stringify(arr)) }
  catch (e) { onStorageError(e) }
}
