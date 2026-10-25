#!/usr/bin/env node
'use strict'

/**
 * Builds a tailored copy of the CV.
 *
 * Everything except the EXPERIENCE bullets comes from
 * $CV_SOURCE_DIR/resume.data.json and is reproduced verbatim.
 *
 *   node build.js --id <application-id> [--bullets <file.json>] [--keep-html]
 *
 * Output: $CV_OUTPUT_DIR/<application-id>/$CV_FILE_NAME  (paths from ../.env)
 *
 * The optional bullets file overrides only the bullets, keyed by job id:
 *   { "nasctech": ["...", "..."], "chi-software": ["...", "..."] }
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
// The style module is resolved per build by loadStyle(); see DEFAULT_STYLE.
const { printPdf } = require('./chrome')
const { SOURCE_DIR, OUTPUT_DIR, OUT_NAME, DATA_FILE } = require('./env')

const TOOLS = __dirname
const RESULT_DIR = OUTPUT_DIR

/**
 * The shipped visual style.
 *
 * `serif` (template.serif.js) is the default because the original design
 * carried the markers of an off-the-shelf resume builder -- see
 * ../CV-STYLE-REPORT.md. `--style original` builds template.js, the older
 * two-accent design, kept as an alternative.
 */
const DEFAULT_STYLE = 'serif'
const STYLE_FILES = { original: './template' }

function loadStyle(name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Bad style name "${name}" (letters, digits and dashes only)`)
  }
  const file = STYLE_FILES[name] || `./template.${name}`
  try {
    return require(file)
  } catch (err) {
    throw new Error(
      `No style "${name}" (expected ${file}.js). ` +
        `Available: original, ${fs
          .readdirSync(TOOLS)
          .filter((f) => /^template\..+\.js$/.test(f))
          .map((f) => f.replace(/^template\.|\.js$/g, ''))
          .join(', ')}`
    )
  }
}

function parseArgs(argv) {
  const args = {
    id: null,
    bullets: null,
    keepHtml: false,
    lang: null,
    style: DEFAULT_STYLE,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--id') args.id = argv[++i]
    else if (a === '--bullets') args.bullets = argv[++i]
    else if (a === '--lang') args.lang = argv[++i]
    else if (a === '--style') args.style = argv[++i]
    else if (a === '--keep-html') args.keepHtml = true
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Unknown argument: ${a}`)
  }
  return args
}

/**
 * Translates the LOCKED text for a non-English build.
 *
 * `--lang cs` loads resume.cs.json and replaces the summary, section headings,
 * job role lines, the degree line and the SKILLS labels. Bullets are not
 * touched — those come from the application's own bullets file and have to be
 * written in the target language there.
 *
 * Only keys present in the translation are replaced, and every key must already
 * exist in the English data, so a typo fails loudly instead of silently
 * dropping a section. Company names, dates, email and the profile links stay as
 * they are: dates in particular must keep the `Mon YYYY` form that screen.py
 * parses employment durations out of.
 */
function applyLanguage(data, lang) {
  if (!lang) return data
  const file = path.join(SOURCE_DIR, `resume.${lang}.json`)
  if (!fs.existsSync(file)) {
    throw new Error(`No translation file for --lang ${lang} (expected ${file})`)
  }
  const t = JSON.parse(fs.readFileSync(file, 'utf8'))

  if (t.summary) {
    if (t.summary.heading) data.summary.heading = t.summary.heading
    if (t.summary.paragraphs) {
      if (t.summary.paragraphs.length !== data.summary.paragraphs.length) {
        throw new Error(
          `${lang}: summary has ${t.summary.paragraphs.length} paragraphs, ` +
            `English has ${data.summary.paragraphs.length}`
        )
      }
      data.summary.paragraphs = data.summary.paragraphs.map((p, i) => ({
        ...p,
        ...t.summary.paragraphs[i],
      }))
    }
  }

  if (t.experience) {
    if (t.experience.heading) data.experience.heading = t.experience.heading
    for (const [id, role] of Object.entries(t.experience.roles || {})) {
      const job = data.experience.jobs.find((j) => j.id === id)
      if (!job) throw new Error(`${lang}: unknown job id "${id}"`)
      job.role = role
    }
  }

  if (t.projects && data.projects) {
    if (t.projects.heading) data.projects.heading = t.projects.heading
    for (const [id, role] of Object.entries(t.projects.roles || {})) {
      const item = data.projects.items.find((p) => p.id === id)
      if (!item) throw new Error(`${lang}: unknown project id "${id}"`)
      item.role = role
    }
  }

  if (t.education) {
    if (t.education.heading) data.education.heading = t.education.heading
    if (t.education.items) {
      t.education.items.forEach((item, i) => {
        if (!data.education.items[i]) {
          throw new Error(`${lang}: education item ${i} does not exist in English`)
        }
        for (const k of ['degree', 'school']) {
          if (item[k]) data.education.items[i][k] = item[k]
        }
      })
    }
  }

  if (t.skills) {
    if (t.skills.heading) data.skills.heading = t.skills.heading
    const labels = t.skills.labels || {}
    const known = new Set(data.skills.groups.map((g) => g.label))
    for (const label of Object.keys(labels)) {
      if (!known.has(label)) {
        throw new Error(
          `${lang}: skills label "${label}" is not in resume.data.json. ` +
            `Known labels: ${[...known].join(', ')}`
        )
      }
    }
    // Values are keyed by the English label too, and land before the rename.
    const values = t.skills.values || {}
    for (const label of Object.keys(values)) {
      if (!known.has(label)) throw new Error(`${lang}: skills value for unknown label "${label}"`)
    }
    for (const g of data.skills.groups) {
      if (values[g.label]) g.value = values[g.label]
      if (labels[g.label]) g.label = labels[g.label]
    }
  }

  applyFullTranslation(data, t, lang)
  data.lang = lang
  return data
}

/**
 * The parts of a translation that make it a complete CV in another language
 * (a baseline resume.ru.json / resume.uk.json), not just translated chrome:
 *
 *   header:     { name }                           contacts and links stay
 *   highlights: { heading, items: [...] }          same count as English
 *   experience: { names, bullets: { <id>: [...] }, dates: { <id>: "..." } }
 *   projects:   { heading, roles, names, bullets, dates }   keyed by item id
 *   education:  { items: [{ degree, school, dates }] }      dates handled here
 *
 * Bullets set by a --bullets file win: tailored text is already written in the
 * target language. Translated dates leave the `Mon YYYY` form, so screen.py
 * will not parse them; such builds are for people, not for an ATS.
 */
function applyFullTranslation(data, t, lang) {
  const entries = (list) => new Map(list.map((j) => [j.id, j]))
  const setPerId = (map, values, key, what) => {
    for (const [id, v] of Object.entries(values || {})) {
      const item = map.get(id)
      if (!item) throw new Error(`${lang}: ${what} for unknown id "${id}"`)
      if (key === 'bullets' && item._tailored) continue
      item[key] = v
    }
  }

  if (t.header && t.header.name) data.header.name = t.header.name

  if (t.highlights && data.highlights) {
    if (t.highlights.heading) data.highlights.heading = t.highlights.heading
    if (t.highlights.items) {
      if (t.highlights.items.length !== data.highlights.items.length) {
        throw new Error(`${lang}: highlights has ${t.highlights.items.length} items, English has ${data.highlights.items.length}`)
      }
      data.highlights.items = t.highlights.items
    }
  }

  if (t.experience) {
    const jobs = entries(data.experience.jobs)
    setPerId(jobs, t.experience.names, 'company', 'company name')
    setPerId(jobs, t.experience.bullets, 'bullets', 'experience bullets')
    setPerId(jobs, t.experience.dates, 'dates', 'experience dates')
  }

  if (t.projects && data.projects) {
    const items = entries(data.projects.items)
    setPerId(items, t.projects.names, 'company', 'project name')
    setPerId(items, t.projects.bullets, 'bullets', 'project bullets')
    setPerId(items, t.projects.dates, 'dates', 'project dates')
  }

  if (t.education && t.education.items) {
    t.education.items.forEach((item, i) => {
      if (item.dates !== undefined) data.education.items[i].dates = item.dates
    })
  }
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function applyBullets(data, overridePath) {
  if (!overridePath) return data
  const raw = JSON.parse(fs.readFileSync(overridePath, 'utf8'))
  // PROJECTS items are tailored like jobs, addressed by the same kind of id.
  const entries = [...data.experience.jobs, ...(data.projects ? data.projects.items : [])]
  const byId = new Map(entries.map((j) => [j.id, j]))

  for (const [jobId, bullets] of Object.entries(raw)) {
    if (jobId.startsWith('_')) continue
    const job = byId.get(jobId)
    if (!job) {
      throw new Error(
        `Bullets file references unknown job id "${jobId}". ` +
          `Known ids: ${[...byId.keys()].join(', ')}`
      )
    }
    if (!Array.isArray(bullets) || bullets.some((b) => typeof b !== 'string')) {
      throw new Error(`Bullets for "${jobId}" must be an array of strings.`)
    }
    job.bullets = bullets
    job._tailored = true // a translation must not overwrite tailored bullets
  }

  applySkillsOverride(data, raw._skills)
  applyLocationOverride(data, raw._location)
  applyPhoneOverride(data, raw._phone)
  return data
}

/**
 * Overrides the phone number shown in the header, for one application only.
 *
 * Pairs with _location: a local address next to a foreign number is the first
 * thing a local recruiter notices. Set both together, or neither.
 */
function applyPhoneOverride(data, phone) {
  if (phone === undefined) return
  if (typeof phone !== 'string' || !phone.trim()) {
    throw new Error('_phone must be a non-empty string.')
  }
  data.header.contact[0] = phone
}

/**
 * Overrides the location shown in the header, for one application only.
 *
 * Local-market postings may want a different address than the master header.
 * Pairs with _phone; name, email and the profile links stay locked.
 */
function applyLocationOverride(data, location) {
  if (location === undefined) return
  if (typeof location !== 'string' || !location.trim()) {
    throw new Error('_location must be a non-empty string.')
  }
  // The master header may carry no location at all; then the override is
  // appended instead of replacing the last entry (which would be a link).
  const contact = data.header.contact
  const links = data.header.links || {}
  const isLocation = (c, i) => i > 0 && !c.includes('@') && !links[c]
  const last = contact.length - 1
  if (isLocation(contact[last], last)) contact[last] = location
  else contact.push(location)
}

/**
 * Per-application override of a locked SKILLS line.
 *
 * SKILLS is locked by standing instruction, so this exists only for the case
 * where the owner authorises a change for one application and not the master CV --
 * e.g. adding a conditional skill a single posting asks for. Keyed by the exact label:
 *
 *   "_skills": { "Databases:": "PostgreSQL, MongoDB (Mongoose), ..." }
 *
 * Unknown labels are rejected rather than silently ignored, and no new lines can
 * be added, so an override can only reword a category that already exists.
 */
function applySkillsOverride(data, overrides) {
  if (!overrides) return
  const byLabel = new Map(data.skills.groups.map((g) => [g.label, g]))

  for (const [label, value] of Object.entries(overrides)) {
    const group = byLabel.get(label)
    if (!group) {
      throw new Error(
        `_skills references unknown label "${label}". ` +
          `Known labels: ${[...byLabel.keys()].join(' | ')}`
      )
    }
    if (typeof value !== 'string') {
      throw new Error(`_skills["${label}"] must be a string.`)
    }
    group.value = value
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(
      'Usage: node build.js --id <application-id> [--bullets <file.json>] [--lang <code>] [--style <name>] [--keep-html]'
    )
    return
  }

  const id = slugify(
    args.id || new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  )
  if (!id) throw new Error('--id produced an empty slug')

  // Order matters: _skills overrides are keyed by the English labels, so they
  // have to land before applyLanguage renames them.
  const data = applyLanguage(
    applyBullets(
      JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')),
      args.bullets
    ),
    args.lang
  )

  const outDir = path.join(RESULT_DIR, id)
  fs.mkdirSync(outDir, { recursive: true })

  const { render, KNOBS } = loadStyle(args.style)
  const html = render(data, KNOBS)
  const htmlPath = args.keepHtml
    ? path.join(outDir, 'resume.html')
    : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-')), 'resume.html')
  fs.writeFileSync(htmlPath, html, 'utf8')

  // A translated build sits next to the English one: cv.pdf -> cv-ru.pdf.
  const outName = args.lang ? OUT_NAME.replace(/(\.pdf)?$/i, `-${args.lang}$1`) : OUT_NAME
  const pdfPath = path.join(outDir, outName)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-profile-'))

  printPdf(htmlPath, pdfPath, userDataDir, [
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=10000',
  ])

  // Record exactly which bullets produced this PDF.
  fs.writeFileSync(
    path.join(outDir, args.lang ? `bullets.used.${args.lang}.json` : 'bullets.used.json'),
    JSON.stringify(
      Object.fromEntries(data.experience.jobs.map((j) => [j.id, j.bullets])),
      null,
      2
    ) + '\n',
    'utf8'
  )

  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(1)
  console.log(`${path.relative(process.cwd(), pdfPath)}  (${kb} KB)`)
}

// Only build when invoked directly. preview.js requires this file to reuse the
// data loading (bullets, _skills, _location, _phone, --lang) rather than keeping
// a second copy of it that would drift.
if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('build failed: ' + err.message)
    process.exit(1)
  }
}

module.exports = { applyBullets, applyLanguage }
