#!/usr/bin/env node
'use strict'

/**
 * Style preview builder. Renders the SAME CV content in one or more visual
 * styles so a human can compare real PDFs before committing to one.
 *
 *   node preview.js --style serif [--style current] [--bullets <file.json>] [--lang cs]
 *
 * Output: $CV_OUTPUT_DIR/_preview/<style>/$CV_FILE_NAME
 *
 * Why this is separate from build.js: a restyle changes every coordinate on
 * purpose, so it gets its own entry point and its own output directory.
 * `_preview` starts with an underscore so it can never collide with an
 * application id and never be mistaken for something sendable.
 *
 * Data loading (bullets, _skills, _location, _phone, --lang) is reused from
 * build.js rather than reimplemented, so the two cannot drift.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { printPdf } = require('./chrome')
const { applyBullets, applyLanguage } = require('./build')
const { OUTPUT_DIR, OUT_NAME, DATA_FILE, venvPython, expectedJobs } = require('./env')

const TOOLS = __dirname
const PREVIEW_DIR = path.join(OUTPUT_DIR, '_preview')

// `current` is the shipped style; anything else resolves to template.<name>.js.
const STYLE_FILES = { current: 'template.js' }

function parseArgs(argv) {
  const args = { styles: [], bullets: null, lang: null, keepHtml: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--style') args.styles.push(argv[++i])
    else if (a === '--bullets') args.bullets = argv[++i]
    else if (a === '--lang') args.lang = argv[++i]
    else if (a === '--keep-html') args.keepHtml = true
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Unknown argument: ${a}`)
  }
  return args
}

function loadStyle(name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Bad style name "${name}" (letters, digits and dashes only)`)
  }
  const file = STYLE_FILES[name] || `template.${name}.js`
  const full = path.join(TOOLS, file)
  if (!fs.existsSync(full)) {
    const available = ['current']
      .concat(
        fs
          .readdirSync(TOOLS)
          .filter((f) => /^template\..+\.js$/.test(f))
          .map((f) => f.replace(/^template\.|\.js$/g, ''))
      )
      .join(', ')
    throw new Error(`No style "${name}" (expected ${file}). Available: ${available}`)
  }
  const mod = require(full)
  if (typeof mod.render !== 'function') {
    throw new Error(`${file} does not export render()`)
  }
  return mod
}

function freshData(bullets, lang) {
  // Re-read per style: applyBullets and applyLanguage mutate the object.
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  return applyLanguage(applyBullets(raw, bullets), lang)
}

/**
 * The gate for a restyled build.
 *
 * verify.py cannot be used here — it diffs against the original PDF, which a
 * restyle intentionally no longer matches. These are the checks that actually
 * matter for a file someone will send:
 *
 *   1. two pages
 *   2. the text layer extracts at all
 *   3. company and dates land on ONE line for every job in the data, because
 *      screen.py's employment regex needs `Company  Mon YYYY - Mon YYYY`
 *      together or it reports zero years of experience
 *   4. no fi/fl ligatures or exotic glyphs in the text layer
 */
function gate(pdfPath) {
  const py = venvPython()
  const nJobs = expectedJobs()
  const script = `
import re, sys
from pypdf import PdfReader
r = PdfReader(${JSON.stringify(pdfPath)})
pages = [p.extract_text() or "" for p in r.pages]
raw = "\\n".join(pages)
span = re.compile(
    r"^(.*?)\\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w* \\d{4})"
    r"\\s*[-\\u2013]\\s*"
    r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w* \\d{4}|Present)",
    re.M,
)
jobs = span.findall(raw)
haz = sorted({c for c in raw if ord(c) > 0x2100 or 0xFB00 <= ord(c) <= 0xFB4F})
fails = []
if len(pages) != 2: fails.append(f"{len(pages)} pages, expected 2")
if len(raw.strip()) < 500: fails.append("almost no extractable text")
if len(jobs) != ${nJobs}: fails.append(f"{len(jobs)} employment entries parsed, expected ${nJobs}")
if haz: fails.append("glyph hazards: " + ", ".join(repr(c) for c in haz))
print(f"   pages {len(pages)}  chars {len(raw.strip())}  employment entries {len(jobs)}")
for c, s, e in jobs:
    print(f"     {c.strip()[:34]:<34} {s} - {e}")
if fails:
    print("   FAIL: " + "; ".join(fails))
    sys.exit(1)
print("   gate ok")
`
  const { spawnSync } = require('child_process')
  const res = spawnSync(py, ['-c', script], { encoding: 'utf8' })
  process.stdout.write(res.stdout || '')
  if (res.stderr) process.stderr.write(res.stderr)
  return res.status === 0
}

function build(style, args) {
  const { render, KNOBS } = loadStyle(style)
  const data = freshData(args.bullets, args.lang)

  const outDir = path.join(PREVIEW_DIR, style)
  fs.mkdirSync(outDir, { recursive: true })

  const html = render(data, KNOBS)
  const htmlPath = args.keepHtml
    ? path.join(outDir, 'resume.html')
    : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-prev-')), 'resume.html')
  fs.writeFileSync(htmlPath, html, 'utf8')

  const pdfPath = path.join(outDir, OUT_NAME)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-prev-profile-'))
  printPdf(htmlPath, pdfPath, userDataDir, [
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=10000',
  ])

  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(1)
  console.log(`\n${style}  ->  ${path.relative(process.cwd(), pdfPath)}  (${kb} KB)`)
  return gate(pdfPath)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.styles.length) {
    console.log(
      'Usage: node preview.js --style <name> [--style <name>...] ' +
        '[--bullets <file.json>] [--lang <code>] [--keep-html]\n\n' +
        'Writes $CV_OUTPUT_DIR/_preview/<style>/$CV_FILE_NAME and checks it.\n' +
        'Styles: current (the shipped design), plus any template.<name>.js'
    )
    return
  }

  const failed = []
  for (const style of args.styles) {
    if (!build(style, args)) failed.push(style)
  }

  if (failed.length) {
    console.error(`\nstyles failing the gate: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nall styles passed the gate. Open the PDFs and compare.')
}

try {
  main()
} catch (err) {
  console.error('preview failed: ' + err.message)
  process.exit(1)
}
