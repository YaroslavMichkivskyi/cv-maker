'use strict'

/**
 * Serif, single-accent style. A restyle, NOT a reproduction.
 *
 * template.js reproduces cv-illia-vysochyn-ua.pdf coordinate for coordinate.
 * This file deliberately does not: it exists because that original design
 * carries the markers of an off-the-shelf resume builder (a two-hue gradient
 * bar, two competing accent colours, coloured employer names, six greys), and
 * the point here is to look typeset instead.
 *
 * Consequences, both intended:
 *
 *   - `verify.py` does not apply. It diffs run-by-run against the original, so
 *     it will report near-total drift on anything built from this file. That is
 *     the restyle working, not a bug. The gate for this style is `screen.py`
 *     parse health plus the two-page fit, which `preview.js` checks.
 *   - `tune.js` does not apply either. It fits KNOBS against the original's
 *     baselines; these knobs were set by eye for serif metrics.
 *
 * What is kept from template.js, and why:
 *
 *   - single column, standard section names, `Mon YYYY - Mon YYYY` dates: this
 *     is what makes the file parse
 *   - the flex `.job-head` row, so company and dates stay on ONE extracted
 *     line — screen.py's employment regex requires that, and stacking them
 *     silently zeroes the parsed years
 *   - inline bullet markers, so the content stream stays in reading order
 *   - `font-variant-ligatures: none`, so "Config" and "Cloudflare" stay
 *     findable in the text layer
 */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')


/**
 * Vertical-rhythm knobs, in CSS pixels.
 *
 * Set by eye for serif metrics, not fitted by tune.js — there is nothing to fit
 * against, since this style is not reproducing the original. Round numbers on
 * purpose: they are a design choice here rather than a measurement.
 *
 * Slightly more generous than template.js. Serif at this size needs air, and
 * whitespace is the cheapest thing that makes a CV read as typeset.
 */
const KNOBS = {
  pageTop: 0,         // @page margin -> name
  headerGap: 20,      // contact block -> first section heading
  h2Rule: 5,          // section heading -> its underline
  expGap: 19,         // summary -> EXPERIENCE heading
  eduGap: 19,         // experience -> EDUCATION heading
  skillsGap: 19,      // education -> SKILLS heading
  summaryTop: 10,     // summary underline -> first paragraph
  jobsTop: 12,        // EXPERIENCE underline -> first company
  roleTop: 7,         // company -> job title
  bulletsTop: 8,      // job title -> first bullet
  jobGap: 16,         // last bullet of a job -> next company
  educationTop: 11,   // EDUCATION underline -> degree line
  skillsTop: 10,      // SKILLS underline -> first skill line
}

const css = (K) => `
@page {
  size: 595.92pt 842.88pt;   /* original media box */
  margin: 42.75pt;           /* 57px */
}

* { margin: 0; padding: 0; box-sizing: border-box; }

/* Three colours, and that is the whole palette:
     --ink      body text, near-black
     --muted    dates and skill values only
     --accent   section headings only, one hue
   plus --rule for hairlines. The original used six greys and two accent hues,
   which is what made it read as a template rather than a document. */
html, body {
  font-family: Palatino, "Palatino Linotype", "Book Antiqua", Georgia,
               "Times New Roman", Times, serif;
  -webkit-font-smoothing: antialiased;
  /* The source PDF emits fi/fl ligatures, so its text layer contains U+FB01 /
     U+FB02 and an ATS searching for "Config" or "Cloudflare" never matches.
     Plain letters keep those keywords findable. */
  font-variant-ligatures: none;
  color: #1a1a1a;
  background: #ffffff;
}

:root {
  --ink: #1a1a1a;
  --muted: #595959;
  --accent: #1f3864;
  --rule: #c8c8c8;
}

/* content box comes from the @page margins: 794.56 - 2*57 = 680.56px */

/* ---------- header ---------- */

.name {
  font-size: 24px;
  font-weight: normal;   /* serif at this size has enough presence unbolded */
  line-height: 29px;
  letter-spacing: 0.01em;
  color: var(--ink);
}

/* No gradient bar. A single hairline the full width of the text block, which is
   what a typeset document does if it rules the header at all. */
.name-rule {
  height: 0;
  margin-top: 7px;
  border-bottom: 0.75px solid var(--rule);
}

.contact {
  margin-top: 8px;
  font-size: 10.5px;
  line-height: 15.75px;
  color: var(--muted);
}

.contact .sep {
  color: var(--rule);
  padding: 0 10px;
}

/* Links must be clickable but must not look like links: the original prints
   LinkedIn and GitHub in the same grey as the rest of the contact line. */
.contact a {
  color: inherit;
  text-decoration: none;
}

header { margin-top: ${K.pageTop}px; margin-bottom: ${K.headerGap}px; }

/* ---------- section headings ---------- */

/* The one place the accent is used. Headings stay uppercase exactly as they are
   in resume.data.json: no text-transform, because that would rewrite the text
   layer an ATS reads, and "standard section headings" is a stated constraint. */
h2 {
  font-size: 11px;
  font-weight: bold;
  line-height: 13px;
  letter-spacing: 0.08em;
  color: var(--accent);
  border-bottom: 0.75px solid var(--rule);
  padding-bottom: ${K.h2Rule}px;
}

section { break-inside: avoid; }
/* Three jobs do not fit beside the summary on page one, and an unbreakable
   EXPERIENCE block would push the whole section to page two and leave page
   one mostly empty. Experience may break between bullets; a job head stays
   with its role line and first bullet. */
#experience { break-inside: auto; }
#experience { margin-top: ${K.expGap}px; }
/* Optional sections added for this CV (KEY ACHIEVEMENTS, PROJECTS) get the
   same gap as every other section; PROJECTS may break like EXPERIENCE. */
#highlights, #projects { margin-top: ${K.expGap}px; }
#projects { break-inside: auto; }
#education  { margin-top: ${K.eduGap}px; }
#skills     { margin-top: ${K.skillsGap}px; }

/* ---------- professional summary ---------- */

.summary { margin-top: ${K.summaryTop}px; }

.summary p {
  font-size: 11px;
  line-height: 17.5px;
  color: var(--ink);
  /* Justified so lines end on one right edge. No hyphens: auto, because the
     hyphen glyph lands in the text layer and splits keywords for an ATS. */
  text-align: justify;
}

.summary p + p { margin-top: 8.5px; }
.summary strong { font-weight: bold; }

/* ---------- experience ---------- */

.jobs { margin-top: ${K.jobsTop}px; }

.job { break-inside: auto; }
.job-head, .role { break-after: avoid-page; }
.job + .job { margin-top: ${K.jobGap}px; }

.job-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

/* Employer in black, not violet. Colouring the company name is a builder
   default and it competes with the section headings for attention. */
.company {
  font-size: 12px;
  font-weight: bold;
  line-height: 15px;
  color: var(--ink);
}

.dates {
  font-size: 10.5px;
  line-height: 15px;
  color: var(--muted);
  white-space: nowrap;
}

.role {
  margin-top: ${K.roleTop}px;
  font-size: 11px;
  font-weight: normal;
  font-style: italic;   /* distinguishes the role from the employer without a second weight */
  line-height: 13.5px;
  color: var(--ink);
}

.job ul {
  margin-top: ${K.bulletsTop}px;
  list-style: none;
}

.job li {
  padding-left: 16px;
  text-indent: -16px;   /* the marker sits in the gutter on the first line */
  font-size: 10.5px;
  line-height: 16.2px;
  color: var(--ink);
  text-align: justify;
  break-inside: avoid-page;
}

.job li + li { margin-top: 4px; }

/* 3px vector disc, centred at x=6.5 and 2.5px above the baseline — matches the
   marker geometry in the source PDF. Kept as an inline-block rather than an
   absolutely positioned box: positioned boxes paint in a later phase, which
   would emit the bullets after the rest of the page in the PDF content stream
   and hand ATS parsers the sections out of reading order. */
.job li::before {
  content: "";
  display: inline-block;
  width: 2.5px;
  height: 2.5px;
  margin: 0 9px 0 4.5px;
  vertical-align: 1.5px;
  border-radius: 50%;
  background: var(--muted);
}

/* ---------- education ---------- */

.education { margin-top: ${K.educationTop}px; }

.edu-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 11px;
  line-height: 13.5px;
}

.edu-row + .edu-row { margin-top: 6px; }
.edu-degree { font-weight: bold; color: var(--ink); }
.edu-school { color: var(--ink); font-weight: normal; font-style: italic; }
.edu-dates {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  padding-left: 12px;
}

/* ---------- skills ---------- */

.skills { margin-top: ${K.skillsTop}px; }

.skills p {
  font-size: 10.5px;
  line-height: 15.4px;
  color: var(--muted);
}

.skills b { font-weight: bold; color: var(--ink); }
`

function render(data, knobs) {
  const K = { ...KNOBS, ...knobs }
  const { header, summary, experience, education, skills } = data

  // The original PDF carries clickable link annotations on LinkedIn and GitHub.
  // Chrome only emits those for real <a href>, so any contact entry with a URL
  // in header.links is wrapped. Colour and weight are inherited so the styling
  // stays identical to the surrounding text.
  const links = header.links || {}
  const contact = header.contact
    .map((c) => (links[c] ? `<a href="${esc(links[c])}">${esc(c)}</a>` : esc(c)))
    .join('<span class="sep">|</span>')

  const summaryParas = summary.paragraphs
    .map(
      (p) =>
        `<p>${p.lead ? `<strong>${esc(p.lead)}</strong>` : ''}${esc(p.text)}</p>`
    )
    .join('\n      ')

  const jobs = experience.jobs.map(jobBlock).join('\n      ')

  // Optional KEY ACHIEVEMENTS section under the summary; bullets reuse the job
  // list styling so the page keeps one visual language.
  const highlights = data.highlights && data.highlights.items.length
    ? `<section id="highlights">
    <h2>${esc(data.highlights.heading)}</h2>
    <div class="jobs"><div class="job"><ul>
      ${data.highlights.items.map((b) => `<li>${esc(b)}</li>`).join('\n      ')}
    </ul></div></div>
  </section>`
    : ''

  // Optional PROJECTS section (personal work), same markup as a job.
  const projects = data.projects && data.projects.items.length
    ? `<section id="projects">
    <h2>${esc(data.projects.heading)}</h2>
    <div class="jobs">
      ${data.projects.items.map(jobBlock).join('\n      ')}
    </div>
  </section>`
    : ''

  function jobBlock(job) {
    return `<div class="job">
        <div class="job-head">
          <span class="company">${esc(job.company)}</span>
          <span class="dates">${esc(job.dates)}</span>
        </div>
        <div class="role">${esc(job.role)}</div>
        <ul>
          ${job.bullets.map((b) => `<li>${esc(b)}</li>`).join('\n          ')}
        </ul>
      </div>`
  }

  // One row per degree; `items` replaces the single degree/school/dates of the
  // original data shape.
  const eduRows = education.items
    .map(
      (e) => `<div class="edu-row">
        <div><span class="edu-degree">${esc(e.degree)} </span><span class="edu-school">${esc(e.school)}</span></div>
        <span class="edu-dates">${esc(e.dates)}</span>
      </div>`
    )
    .join('\n      ')

  const skillLines = skills.groups
    .map((g) => `<p><b>${esc(g.label)}</b> ${esc(g.value)}</p>`)
    .join('\n      ')

  return `<!DOCTYPE html>
<html lang="${esc(data.lang || 'en')}">
<head>
<meta charset="utf-8">
<title>${esc(header.name)} - CV</title>
<style>${css(K)}</style>
</head>
<body>
  <header>
    <div class="name">${esc(header.name)}</div>
    <div class="name-rule"></div>
    <div class="contact">${contact}</div>
  </header>

  <section>
    <h2>${esc(summary.heading)}</h2>
    <div class="summary">
      ${summaryParas}
    </div>
  </section>

  ${highlights}

  <section id="experience">
    <h2>${esc(experience.heading)}</h2>
    <div class="jobs">
      ${jobs}
    </div>
  </section>

  ${projects}

  <section id="education">
    <h2>${esc(education.heading)}</h2>
    <div class="education">
      ${eduRows}
    </div>
  </section>

  <section id="skills">
    <h2>${esc(skills.heading)}</h2>
    <div class="skills">
      ${skillLines}
    </div>
  </section>
</body>
</html>
`
}

module.exports = { render, KNOBS }
