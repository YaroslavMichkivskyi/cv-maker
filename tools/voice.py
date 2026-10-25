#!/usr/bin/env python
"""Flag text that reads as machine-written, and characters that give it away.

    py voice.py <output>/<id>/about-me.txt
    py voice.py <output>/<id>/<cv>.pdf

Recruiters and some ATS platforms now screen for generic AI phrasing, and the
typographic characters a model emits by default (em dashes, curly quotes) are
the easiest tell of all -- they also mangle when pasted into a plain form field.

Four passes:

  1. SYMBOLS    non-ASCII typography that a person typing into a form never produces
  2. PHRASES    AI-register vocabulary
  3. CLICHES    resume filler that says nothing
  4. STRUCTURE  the sentence shapes a model falls into

Nothing here is auto-corrected. Every hit is a prompt to reread the line and
decide -- some are legitimate, especially when mirroring the posting's own words.
"""

import re
import statistics
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Characters a model emits by default and a human filling in a web form does not.
# The replacement column is what to type instead.
SYMBOLS = {
    "—": ("em dash", "-, or split the sentence"),
    "–": ("en dash", "- for ranges"),
    "‘": ("curly open quote", "'"),
    "’": ("curly apostrophe", "'"),
    "“": ("curly open quote", '"'),
    "”": ("curly close quote", '"'),
    "…": ("ellipsis character", "..."),
    " ": ("non-breaking space", "a normal space"),
    "•": ("bullet character", "a plain list"),
    "→": ("arrow", "'to'"),
    "​": ("zero-width space", "delete it"),
    "️": ("variation selector", "delete it"),
    "­": ("soft hyphen", "delete it"),
}

# Vocabulary that reads as model-written in a resume or cover note.
PHRASES = [
    r"delve", r"tapestry", r"realm of", r"landscape of", r"testament to",
    r"navigat\w+ the complexit", r"in today's (?:fast-paced|ever-\w+|digital)",
    r"ever-(?:evolving|changing|growing)", r"at the forefront",
    r"leverag(?:e|ing|ed)", r"utiliz(?:e|ing|ed)", r"harness(?:ing|ed)", r"harness the",  # the verb is the tell; "coding harness" is a noun
    r"foster(?:ing|ed)?", r"empower(?:ing|ed)?", r"streamlin(?:e|ing|ed)",
    r"facilitat(?:e|ing|ed)", r"spearhead(?:ing|ed)?", r"showcas(?:e|ing|ed)",
    r"underscor(?:e|es|ing|ed)", r"pivotal", r"robust", r"seamless(?:ly)?",
    r"cutting-edge", r"state-of-the-art", r"best-in-class", r"game-chang\w+",
    r"holistic", r"synerg\w+", r"myriad", r"plethora", r"meticulous(?:ly)?",
    r"comprehensive", r"unlock(?:ing)?", r"elevat(?:e|ing|ed)",
    r"embark(?:ing|ed)?", r"crucial", r"vital role", r"significantly enhanc\w+",
    r"a wide (?:range|array) of", r"deep dive", r"unwavering",
    r"i am excited", r"i'm excited", r"thrilled", r"passionate about",
    r"it(?:'s| is) worth noting", r"moreover", r"furthermore", r"additionally,",
    # AI-workflow jargon: "scaffolding" is how a model describes its own use. Say "writing code".
    r"scaffold(?:s|ed|ing)?", r"скафолдинг\w*",
]

# Says nothing a hiring manager can check.
CLICHES = [
    r"proven track record", r"results-(?:driven|oriented)", r"detail-oriented",
    r"team player", r"self-starter", r"go-getter", r"hard[- ]working",
    r"think outside the box", r"hit the ground running", r"wear many hats",
    r"strong work ethic", r"excellent communication skills",
    r"dynamic (?:environment|individual|professional)", r"fast learner",
    r"out of the box", r"value add", r"synergies", r"win-win",
]


def load(path):
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader

        return "\n".join(p.extract_text() or "" for p in PdfReader(str(path)).pages)
    return path.read_text(encoding="utf8")


def context(text, start, end, width=34):
    lo = max(0, start - width)
    hi = min(len(text), end + width)
    snippet = text[lo:hi].replace("\n", " ")
    return ("..." if lo else "") + snippet + ("..." if hi < len(text) else "")


def report(title, hits, note=None):
    print(title)
    print("-" * 72)
    if not hits:
        print("   clean")
    else:
        for line in hits:
            print(f"   {line}")
    if note and hits:
        print(f"\n   {note}")
    print()
    return len(hits)


def scan_symbols(text):
    hits = []
    for char, (name, fix) in SYMBOLS.items():
        n = text.count(char)
        if n:
            first = text.index(char)
            hits.append(f"{n}x {name} (U+{ord(char):04X}) -> use {fix}")
            hits.append(f"     {context(text, first, first + 1)}")
    return report(
        "1. SYMBOLS -- typography that gives away a machine",
        hits,
        "These also break when pasted into a plain form field. Retype them.",
    )


def scan_patterns(title, patterns, text, note):
    hits = []
    for pattern in patterns:
        for m in re.finditer(pattern, text, re.I):
            hits.append(f"\"{m.group(0)}\"")
            hits.append(f"     {context(text, m.start(), m.end())}")
    return report(title, hits, note)


# "Apr 2024 - Jul 2026", "2021 - 2025" -- a hyphen doing honest work, not a
# model reaching for an aside. Resumes are full of them.
DATE_RANGE = re.compile(
    r"\b(?:\w{3,9} )?\d{4}\s*[-–—]\s*(?:(?:\w{3,9} )?\d{4}|Present)\b", re.I
)


def scan_structure(text):
    hits = []
    words = len(text.split())
    prose = DATE_RANGE.sub(" ", text)

    # A model reaches for a dashed aside far more often than a person does.
    asides = len(re.findall(r"\s[-–—]\s", prose))
    if asides and words:
        per100 = asides / words * 100
        if per100 > 0.8:
            hits.append(
                f"{asides} dashed asides in {words} words ({per100:.1f} per 100) "
                f"-- rewrite some as their own sentence or use commas"
            )

    for pattern, label in [
        (r"not only\b[^.]{0,60}\bbut also", "'not only X but also Y'"),
        (r"is(?:n't| not) just\b[^.]{0,40}\bit's", "'isn't just X, it's Y'"),
        (r"(?m)^\s*(?:Moreover|Furthermore|Additionally|Importantly|Notably|Ultimately)\b",
         "sentence opening with a connector adverb"),
        (r"\bfrom\b[^.]{0,30}\bto\b[^.]{0,30}\bto\b", "'from X to Y to Z' escalation"),
    ]:
        for m in re.finditer(pattern, text, re.I):
            hits.append(f"{label}: {context(text, m.start(), m.end())}")

    # Triads everywhere is the single most recognisable model habit -- but a
    # resume enumerates legitimately, so judge by density rather than count.
    triads = len(re.findall(r"\w+,\s+\w+,?\s+and\s+\w+", text))
    if words and triads >= 3 and triads / words * 100 > 1.0:
        hits.append(
            f"{triads} three-item lists in {words} words "
            f"-- vary the rhythm, some as pairs"
        )

    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.split()]
    if len(sentences) >= 4:
        lengths = [len(s.split()) for s in sentences]
        spread = statistics.pstdev(lengths)
        if spread < 3:
            hits.append(
                f"sentence lengths near-identical ({lengths}) -- humans vary more"
            )

    return report("4. STRUCTURE -- shapes a model falls into", hits)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    path = Path(sys.argv[1])
    text = load(path)
    words = len(text.split())

    print()
    print(f"VOICE CHECK  {path.name}   ({words} words)")
    print("=" * 72)
    print()

    total = scan_symbols(text)
    total += scan_patterns(
        "2. PHRASES -- AI-register vocabulary",
        PHRASES,
        text,
        "Say the plain thing instead: 'used' not 'leveraged', 'built' not 'spearheaded', 'writing code' not 'scaffolding'.",
    )
    total += scan_patterns(
        "3. CLICHES -- resume filler a reader cannot check",
        CLICHES,
        text,
        "Replace each with the specific thing it is standing in for.",
    )
    total += scan_structure(text)

    print("VERDICT")
    print("-" * 72)
    if total == 0:
        print("   Nothing flagged. Read it aloud once anyway -- that catches what")
        print("   no word list can.")
    else:
        print(f"   {total} item(s) to review above.")
        print("   A hit is not automatically wrong. Mirroring the posting's own")
        print("   wording is fine; sounding like a model is not.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
