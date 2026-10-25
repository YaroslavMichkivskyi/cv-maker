#!/usr/bin/env node
'use strict'

/**
 * Rebuilds every application in $CV_OUTPUT_DIR in the current default style.
 *
 *   node migrate-style.js [--dry-run] [--only <substring>]
 *
 * Any locked-section amendment (SKILLS, an employer rename, a style change)
 * invalidates every PDF already built, and doing that by hand across many
 * folders is how one gets missed.
 *
 * For each folder it runs build.js with that folder's own bullets.json, adding
 * `--lang <code>` for ids ending in `-<code>` when resume.<code>.json exists,
 * then checks the output:
 *
 *   - two pages
 *   - every employment entry parsed, which is what screen.py needs and the one
 *     thing a restyle can silently break
 *
 * Failures are collected and printed at the end rather than stopping the run,
 * because a single application that no longer fits should not block the rest.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { SOURCE_DIR, OUTPUT_DIR, OUT_NAME, venvPython, expectedJobs } = require('./env')

const TOOLS = __dirname
const RESULT = OUTPUT_DIR
const PY = venvPython()
const N_JOBS = expectedJobs()
const LANGS = fs
  .readdirSync(SOURCE_DIR)
  .map((f) => (f.match(/^resume\.([a-z]{2})\.json$/) || [])[1])
  .filter(Boolean)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const onlyIdx = args.indexOf('--only')
const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null

const CHECK = `
import sys, re
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
pages = [p.extract_text() or "" for p in r.pages]
raw = "\\n".join(pages)
span = re.compile(
    r"^(.*?)\\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w* \\d{4})"
    r"\\s*[-\\u2013]\\s*"
    r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w* \\d{4}|Present)",
    re.M,
)
print(f"{len(pages)} {len(span.findall(raw))} {len(raw.strip())}")
`

function check(pdf) {
  const res = spawnSync(PY, ['-c', CHECK, pdf], { encoding: 'utf8' })
  if (res.status !== 0) return { ok: false, why: 'could not read the PDF' }
  const [pages, jobs, chars] = res.stdout.trim().split(/\s+/).map(Number)
  const why = []
  if (pages !== 2) why.push(`${pages} pages`)
  if (jobs !== N_JOBS) why.push(`${jobs} employment entries, expected ${N_JOBS}`)
  if (chars < 500) why.push('no extractable text')
  return { ok: !why.length, why: why.join(', '), pages, jobs }
}

const ids = fs
  .readdirSync(RESULT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .filter((id) => !only || id.includes(only))
  .sort()

console.log(`${ids.length} applications to rebuild${dryRun ? ' (dry run)' : ''}\n`)

const failed = []
const skipped = []
let done = 0

for (const id of ids) {
  const dir = path.join(RESULT, id)
  const bullets = path.join(dir, 'bullets.json')
  const hasBullets = fs.existsSync(bullets)
  const pdf = path.join(dir, OUT_NAME)

  // A folder with neither bullets nor a previous PDF is not an application.
  if (!hasBullets && !fs.existsSync(pdf)) {
    skipped.push(`${id} (no bullets.json, no previous PDF)`)
    continue
  }

  const argv = ['build.js', '--id', id]
  if (hasBullets) argv.push('--bullets', bullets)
  const lang = LANGS.find((l) => id.endsWith(`-${l}`))
  if (lang) argv.push('--lang', lang)

  if (dryRun) {
    console.log(`  would run: node ${argv.join(' ')}`)
    continue
  }

  try {
    execFileSync(process.execPath, argv, { cwd: TOOLS, stdio: 'pipe' })
  } catch (err) {
    failed.push(`${id}: build failed -- ${String(err.stderr || err).trim().split('\n').pop()}`)
    continue
  }

  const res = check(pdf)
  done++
  if (!res.ok) {
    failed.push(`${id}: ${res.why}`)
    console.log(`  ${done}/${ids.length}  ${id}  FAIL (${res.why})`)
  } else {
    console.log(`  ${done}/${ids.length}  ${id}`)
  }
}

if (dryRun) process.exit(0)

console.log(`\nrebuilt ${done} of ${ids.length}`)
if (skipped.length) {
  console.log(`\nskipped ${skipped.length}:`)
  for (const s of skipped) console.log(`  ${s}`)
}
if (failed.length) {
  console.log(`\n${failed.length} need attention:`)
  for (const f of failed) console.log(`  ${f}`)
  process.exit(1)
}
console.log('\nevery application is two pages with every role parsed.')
