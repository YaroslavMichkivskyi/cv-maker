'use strict'

/**
 * HTML template reproducing the exact visual style of cv-illia-vysochyn-ua.pdf.
 *
 * Every number below was measured out of the original PDF's content stream.
 * Its internal coordinate space is CSS pixels, so the values map 1:1 onto CSS.
 * Do not "clean up" the odd decimals — they are what makes every baseline in
 * the output land on the same y as the original (`py verify.py` proves it).
 */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')


/**
 * Vertical-rhythm knobs, in CSS pixels.
 *
 * These were fitted against the original PDF by tune.js — every text baseline
 * and rule in the generated file lands on the same y as the original. Changing
 * one shifts everything below it, so re-run `node tune.js` after any edit.
 */
const KNOBS = {
  pageTop: -0.56,         // @page margin -> name; the only knob above the header
  headerGap: 18.68,   // contact block -> first section heading
  h2Rule: 4.98,       // section heading -> its underline
  expGap: 17.97,      // summary -> EXPERIENCE heading
  eduGap: 17.95,      // experience -> EDUCATION heading
  skillsGap: 19.03,   // education -> SKILLS heading
  summaryTop: 9.96,   // summary underline -> first paragraph
  jobsTop: 10.98,      // EXPERIENCE underline -> first company
  roleTop: 6.8,       // company -> job title
  bulletsTop: 7.8,    // job title -> first bullet
  jobGap: 15.2,       // last bullet of a job -> next company
  educationTop: 10.8, // EDUCATION underline -> degree line
  skillsTop: 9.3,    // SKILLS underline -> first skill line
}

const css = (K) => `
@page {
  size: 595.92pt 842.88pt;   /* original media box */
  margin: 42.75pt;           /* 57px */
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  font-family: Helvetica, Arial, "Liberation Sans", sans-serif;
  -webkit-font-smoothing: antialiased;
  /* The source PDF emits fi/fl ligatures, so its text layer contains U+FB01 /
     U+FB02 and an ATS searching for "Config" or "Cloudflare" never matches.
     Plain letters keep those keywords findable. */
  font-variant-ligatures: none;
  color: #333333;
  background: #ffffff;
}

/* content box comes from the @page margins: 794.56 - 2*57 = 680.56px */

/* ---------- header ---------- */

.name {
  font-size: 28px;
  font-weight: bold;
  line-height: 32.5px;
  letter-spacing: -0.02em;
  color: #1a1a2e;
}

.gradient-rule {
  height: 2px;
  margin-top: 4.5px;
  background: linear-gradient(to right, #15808e, #7322c3);
}

.contact {
  margin-top: 10.25px;
  font-size: 10.5px;
  line-height: 15.75px;
  color: #555555;
}

.contact .sep {
  color: #cccccc;
  padding: 0 14px;
}

/* Links must be clickable but must not look like links: the original prints
   LinkedIn and GitHub in the same grey as the rest of the contact line. */
.contact a {
  color: inherit;
  text-decoration: none;
}

header { margin-top: ${K.pageTop}px; margin-bottom: ${K.headerGap}px; }

/* ---------- section headings ---------- */

h2 {
  font-size: 12px;
  font-weight: bold;
  line-height: 14px;
  letter-spacing: 0.06em;
  color: #15808e;
  border-bottom: 1px solid #e2e2e2;
  padding-bottom: ${K.h2Rule}px;
}

section { break-inside: avoid; }
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
  line-height: 18.5px;
  color: #2f2f2f;
  /* Justified so lines end on one right edge. No hyphens: auto, because the
     hyphen glyph lands in the text layer and splits keywords for an ATS. */
  text-align: justify;
}

.summary p + p { margin-top: 8.5px; }
.summary strong { font-weight: bold; }

/* ---------- experience ---------- */

.jobs { margin-top: ${K.jobsTop}px; }

.job { break-inside: avoid-page; }
.job + .job { margin-top: ${K.jobGap}px; }

.job-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.company {
  font-size: 12.5px;
  font-weight: bold;
  line-height: 15px;
  color: #7322c3;
}

.dates {
  font-size: 10.5px;
  line-height: 15px;
  color: #777777;
  white-space: nowrap;
}

.role {
  margin-top: ${K.roleTop}px;
  font-size: 11px;
  font-weight: bold;
  line-height: 13.5px;
  color: #333333;
}

.job ul {
  margin-top: ${K.bulletsTop}px;
  list-style: none;
}

.job li {
  padding-left: 18px;
  text-indent: -18px;   /* the marker sits in the gutter on the first line */
  font-size: 10.5px;
  line-height: 16.8px;
  color: #333333;
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
  width: 3px;
  height: 3px;
  margin: 0 10px 0 5px;
  vertical-align: 1px;
  border-radius: 50%;
  background: #333333;
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
.edu-degree { font-weight: bold; color: #333333; }
.edu-school { color: #7322c3; font-weight: normal; }
.edu-dates {
  font-size: 10px;
  color: #777777;
  white-space: nowrap;
  padding-left: 12px;
}

/* ---------- skills ---------- */

.skills { margin-top: ${K.skillsTop}px; }

.skills p {
  font-size: 10.5px;
  line-height: 15.75px;
  color: #444444;
}

.skills b { font-weight: bold; color: #333333; }
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
    <div class="gradient-rule"></div>
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
      ${education.items
        .map(
          (e) => `<div class="edu-row">
        <div><span class="edu-degree">${esc(e.degree)} </span><span class="edu-school">${esc(e.school)}</span></div>
        <span class="edu-dates">${esc(e.dates)}</span>
      </div>`
        )
        .join('\n      ')}
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
