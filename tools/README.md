# CV build tooling

Regenerates the CV with different bullets and nothing else changed.
Rules for *what* to write live in `../AGENTS.md`; this file is *how* to run it.

## Setup (once per machine)

```sh
cp ../.env.example ../.env          # then set the three paths
py -3 -m venv .venv                 # Windows; POSIX: python3 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # POSIX: .venv/bin/python
```

Needs Node.js 18+ and Chrome or Edge (`CHROME_PATH` in `.env` if not found).

## Paths — `../.env`

| Var | Meaning |
| --- | --- |
| `CV_SOURCE_DIR` | holds `resume.data.json` (renders the PDF), `master-resume.md`, `amendments.md`, optional `resume.<lang>.json` |
| `CV_OUTPUT_DIR` | `<id>/` folders are written here; `_preview/` for style previews |
| `CV_FILE_NAME` | file name of the PDF in every folder |

Relative paths resolve from `daemons/cv-maker/`. Real environment variables
win over the file. `env.js` (Node) and `screen.py` read it.

## Build

```sh
node build.js --id <application-id> [--bullets <file.json>] [--lang <code>] [--style <name>] [--keep-html]
```

Writes `$CV_OUTPUT_DIR/<application-id>/$CV_FILE_NAME`, plus `bullets.used.json`
recording exactly which bullets produced it. With no `--bullets` you get the
baseline CV (`--id baseline`).

The bullets file overrides only the EXPERIENCE bullet lists, keyed by job id
from `resume.data.json` — see `bullets.example.json`. A job you leave out keeps
its baseline bullets. Optional keys, for one application only:

- `_skills` — `{ "<exact label>:": "<new value>" }`, rewords an existing SKILLS
  line. Unknown labels throw; no new lines can be added.
- `_location` and `_phone` — replace those two header fields. Set them
  together. Name, email and profile links stay locked.

Everything else in `resume.data.json` is locked and unreachable from a bullets
file. `resume.data.json` is never modified by a build.

Rendering uses headless Chrome (`--print-to-pdf`). Chrome no longer exits after
printing, so `chrome.js` waits for the file to stop growing and kills the
process tree (`taskkill /T` on Windows).

## Styles

- `serif` (default, `template.serif.js`) — one accent, no gradient; see
  `../CV-STYLE-REPORT.md` for why the builder-looking original was replaced.
  EXPERIENCE may break across pages between bullets (needed for 3+ jobs).
- `original` (`template.js`) — the friend's earlier two-accent design.

```sh
node preview.js --style serif --style current [--bullets <file.json>] [--lang <code>]
```

Builds styles side by side into `$CV_OUTPUT_DIR/_preview/<style>/` and runs the
**layout gate**: 2 pages, text extracts, every job in `resume.data.json` parsed
as `Company  Mon YYYY - Mon YYYY` on one line, no glyph hazards. Use it after
every build.

## Other languages

`--lang <code>` loads `$CV_SOURCE_DIR/resume.<code>.json` and translates only the
locked text: summary, section headings, job role lines, education degree/school
lines (`education.items[i]`), SKILLS labels. Skill values, company names and
dates stay as they are — dates must keep `Mon YYYY - Mon YYYY` for `screen.py`.
Bullets are written in the target language in the application's bullets file.
One folder per language: `<id>` and `<id>-<code>`. Unknown labels or ids and a
summary paragraph-count mismatch throw. The translation must be updated in the
same pass as any English locked-text change.

## Screen

```sh
.venv/Scripts/python screen.py <output>/<id>/<cv>.pdf <output>/<id>/job-description.md
```

Reads the PDF's real text layer the way a recruiting system does. Five passes:
**parse** (pages, text, contact fields, sections, employment entries with
durations and gaps, glyph hazards), **screen** (hard requirements met vs
missed; headings like `Requirements` / `Nice to have` classify the terms under
them), **keywords** (coverage, missing terms ranked by repetition), **first
look** (top lines, title echo), **verdict**. The vocabulary grows from the
SKILLS section of `resume.data.json`. Coverage is a proxy, not an ATS verdict.

## Voice check

```sh
.venv/Scripts/python voice.py <output>/<id>/about-me.txt
.venv/Scripts/python voice.py <output>/<id>/<cv>.pdf
```

Four passes: symbols, AI-register phrases, clichés, structure. Nothing is
auto-corrected; a hit is a prompt to reread the line.

## Rebuild everything

```sh
node migrate-style.js [--dry-run] [--only <substring>]
```

Rebuilds every application from its own `bullets.json` (adding `--lang` for
`-<code>` ids that have a translation file) and reports any that are no
longer two pages or lose an employment entry.

## Files

| file | role |
| --- | --- |
| `env.js` | reads `../.env`, resolves paths, finds the venv python |
| `build.js` | CLI — data + bullets + overrides → HTML → PDF |
| `template.serif.js` | default style |
| `template.js` | alternative `original` style |
| `chrome.js` | finds Chrome/Edge, prints HTML to PDF |
| `preview.js` | side-by-side style builds + layout gate |
| `migrate-style.js` | rebuilds every application after a locked-section change |
| `screen.py` | ATS-style screen of a PDF against a posting |
| `voice.py` | machine-written phrasing and typography check |
| `bullets.example.json` | bullets file shape |
| `requirements.txt` | Python deps (`pypdf`) |

## Not ported

`verify.py`, `tune.js`, `probe.js`, `runs.js` diffed builds pixel-by-pixel
against the friend's original PDF; there is no such original for this CV.
The ATS-safety choices they protected are kept in the templates: no `fi`/`fl`
ligatures (`font-variant-ligatures: none`) and inline bullet markers so the
PDF content stream stays in reading order.
