#!/usr/bin/env python
"""First-look screen: read a generated CV the way a recruiting system reads it.

    py screen.py <output>/<id>/<cv>.pdf job-description.txt

Works off the PDF's real text layer -- the same characters an ATS parser gets --
rather than the source data, so parsing problems show up here instead of after
you have applied. Reports, in the order a screen actually happens:

  1. PARSE      can the system read the file at all, and into which fields
  2. SCREEN     hard requirements from the posting: met, missed, unstated
  3. KEYWORDS   coverage of the posting's vocabulary, missing terms ranked
  4. FIRST LOOK what a human sees in the top third of page one
  5. VERDICT    what to fix, most costly first

The keyword score is a coverage proxy, not a real ATS score -- no vendor's
scoring is public, and the real systems mostly rank rather than reject. Use it
to find gaps, not to chase a number.
"""

import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent

# Terms worth matching on that a posting is likely to spell out. Anything in the
# CV's own SKILLS section is added to this at runtime, so the vocabulary tracks
# the resume without being edited twice.
BASE_VOCAB = """
accessibility agile algorithms analytics android ansible api apollo architecture
aws azure babel backend bash bdd bitbucket ci/cd cloudformation cloud composer
containers cypress dart database ddd design-systems devops django docker e2e
elasticsearch electron etl expo express fastapi figma firebase flask flutter
frontend full-stack gcp git github gitlab golang grafana graphql grpc html
http i18n ios java javascript jenkins jest jira jwt kafka kotlin kubernetes
lambda linux localization microservices mobile mongodb monorepo mvp mysql nestjs
netlify next.js node.js nosql npm oauth objective-c observability onboarding
openapi pair-programming performance php playwright postgresql prisma
product-management prometheus pwa python rabbitmq react react-native
redis redux relational rest rspec ruby rust saas sass scala scrum sdk security
selenium sentry seo serverless soap spa spring sql sqlite sre ssr storybook
stripe svelte swift swiftui tailwind tdd team-lead terraform testing typescript
unit-testing ux vercel vite vue webpack websockets webrtc xcode
deep-links push-notifications app-store google-play react-navigation
native-modules offline-first keychain biometrics code-review release-management
webflow wordpress gtm seo ab-testing amplitude segment ga4 core-web-vitals
landing-pages mentorship conversion experimentation optimizely vwo css
sqlite sqlcipher encryption data-sync conflict-resolution android-tooling
agentic-ai healthcare decision-tree low-spec-devices
sse rtk-query payments react-hook-form data-heavy dashboards server-state
legacy-code continuous-delivery feature-ownership advertising
realm azure oop design-patterns component-library ui-ux automated-testing
app-center npm-packages device-integration
pixi webgl skeletal-animation rpc event-streaming streaming-protocols anti-cheat
telemetry orchestration memory-management game-client technical-debt
kanban scalability best-practices cross-functional stakeholders
webview white-label profiling animations crash-reporting igaming flux
localstorage sessionstorage browser-internals design-patterns component-library
geospatial leaflet folium three-d s3 digital-twin state-management
vue3 composition-api pinia vue-router nuxt axios dynamic-forms lazy-loading
asyncstorage ota-updates swagger mvvm clean-architecture modular-architecture
solid-principles oop clean-code feature-sliced gesture-handler high-load
erp owasp sast-dast object-storage gcs migrations indexing transactions
file-uploads forms rollbacks incident-response
mcp cursor codex rag evals structured-outputs llm-api context-engineering
claude-agent-sdk subagents claude-code prompt-engineering certification
banking crypto trading startup ownership
distributed-systems cloud-native mcp rails ember dotnet csharp production-monitoring
cocoapods eas video-sdk marketplace edtech release-train autonomy
expo-router react-router nx bun pulumi revenuecat drm video-streaming
in-app-purchase hexagonal clean-architecture react-native-web ota testflight
staged-rollout crash-triage permissions list-virtualization agent-harness
design-system oauth scss uml ui-kit data-structures owasp laravel salesforce openai llm google-api multi-tenant background-jobs rds
russian polish german spanish french trading brokerage
grpc-web zustand xss csrf token-storage order-book realtime-chat p2p
snowflake angular developer-portal profiling-tools data-warehouse
app-lifecycle crm saas jewelry product-mindset independence
browser-extension desktop-app streaming-ui agentic-workflows high-availability multi-surface
vanilla-js css-preprocessor cross-browser html-templates enterprise
bullmq admin-tools prototyping job-queues internal-tools
""".split()

# Surface forms that mean the same thing to a person but not to a string match.
ALIASES = {
    "node.js": ["node.js", "nodejs", "node js", "node"],
    "react-native": ["react native", "react-native"],
    "next.js": ["next.js", "nextjs", "next js"],
    "ci/cd": ["ci/cd", "ci cd", "cicd", "continuous integration", "continuous delivery"],
    "typescript": ["typescript"],
    "javascript": ["javascript", "ecmascript"],
    "postgresql": ["postgresql", "postgres", "psql"],
    "kubernetes": ["kubernetes", "k8s"],
    "full-stack": ["full-stack", "full stack", "fullstack"],
    "react": ["react", "react.js", "reactjs"],
    "rest": ["rest", "rest api", "rest apis", "restful"],
    "team-lead": ["team lead", "tech lead", "team leadership", "led a team",
                  "leading a team", "engineering manager"],
    "unit-testing": ["unit test", "unit testing", "unit tests"],
    "tdd": ["tdd", "test-driven", "test driven"],
    "grpc-web": ["grpc-web", "grpc web"],
    "zustand": ["zustand"],
    "xss": ["xss", "cross-site scripting"],
    "csrf": ["csrf", "cross-site request forgery"],
    "token-storage": ["token storage", "secure token", "token handling"],
    "order-book": ["order book", "order-book", "trading board"],
    "realtime-chat": ["real-time chat", "realtime chat", "chat application"],
    "p2p": ["p2p", "peer-to-peer"],
    "snowflake": ["snowflake"],
    "app-lifecycle": ["app lifecycle", "application lifecycle"],
    "crm": ["crm"],
    "vanilla-js": ["vanilla javascript", "vanilla js", "plain javascript"],
    "css-preprocessor": ["css preprocessor", "scss", "sass", "less"],
    "cross-browser": ["cross-browser", "cross browser"],
    "html-templates": ["html template"],
    "enterprise": ["enterprise"],
    "saas": ["saas"],
    "bullmq": ["bullmq", "bull queue"],
    "admin-tools": ["admin tool", "admin panel", "back office"],
    "prototyping": ["prototyp", "proof of concept"],
    "job-queues": ["job queue", "background job", "worker queue"],
    "internal-tools": ["internal tool", "internal platform"],
    "product-mindset": ["product mindset", "product-minded", "user needs"],
    "independence": ["independently", "autonomously", "work independently"],
    "browser-extension": ["browser extension", "chrome extension", "web extension"],
    "desktop-app": ["desktop app", "electron", "native desktop"],
    "streaming-ui": ["streaming content", "streaming response", "stream and render", "token streaming"],
    "agentic-workflows": ["agentic workflow", "agent workflow", "inline agent", "agent builder"],
    "high-availability": ["high availability", "uptime"],
    "multi-surface": ["multi-surface", "multiple surfaces", "across surfaces", "cross-platform"],
    "angular": ["angular"],
    "developer-portal": ["developer portal", "internal portal"],
    "data-warehouse": ["data warehouse", "warehouse", "olap"],
    "e2e": ["e2e", "end-to-end testing", "end to end testing"],
    "graphql": ["graphql"],
    "objective-c": ["objective-c", "objective c"],
    "deep-links": ["deep link", "deep linking", "universal link", "app link"],
    "push-notifications": ["push notification", "fcm", "apns", "remote notification"],
    "app-store": ["app store", "appstore", "testflight"],
    "google-play": ["google play", "play store", "play console"],
    "react-navigation": ["react navigation"],
    "native-modules": ["native module", "native bridge", "turbomodule", "config plugin"],
    "offline-first": ["offline", "offline-first", "network loss", "reconnect"],
    "biometrics": ["biometric", "face id", "touch id"],
    "code-review": ["code review", "code-review", "pull request review", "pr review"],
    "release-management": ["release", "rollout", "store submission"],
    "ab-testing": ["a/b test", "ab test", "a/b testing", "split test", "experiment"],
    "seo": ["seo", "search engine optimization"],
    "gtm": ["gtm", "google tag manager", "tag management"],
    "ga4": ["ga4", "google analytics"],
    "core-web-vitals": ["core web vitals", "web vitals", "lighthouse"],
    "mentorship": ["mentor", "mentoring", "mentorship", "mentored"],
    "landing-pages": ["landing page"],
    "sqlite": ["sqlite", "op-sqlite", "expo-sqlite"],
    "sqlcipher": ["sqlcipher"],
    "encryption": ["encrypted", "encryption", "at rest", "secure store", "keychain"],
    # Not a bare "sync" -- that matches "internal team syncs", which is a meeting.
    "data-sync": ["data sync", "in sync", "syncing", "synchronisation",
                  "synchronization", "sync architecture", "sync logic"],
    "conflict-resolution": ["conflict resolution", "conflict-resolution", "merge conflict"],
    "android-tooling": ["android build", "gradle", "android studio"],
    "agentic-ai": ["agentic ai", "ai agent", "coding agent", "ai tool", "ai-assisted"],
    "healthcare": ["healthcare", "clinical", "health worker", "medical"],
    "decision-tree": ["decision tree", "decision-tree"],
    "best-practices": ["best practice", "code quality", "quality gate"],
    "cross-functional": ["cross-functional", "cross functional"],
    "stakeholders": ["stakeholder", "product owner"],
    "scalability": ["scalable", "scalability", "scale"],
    "webview": ["webview", "web view"],
    "white-label": ["white label", "white-label", "multi-brand", "multi-tenant"],
    "profiling": ["profiling", "profiled", "profiler", "flipper", "hermes"],
    "animations": ["animation", "reanimated", "gesture handler"],
    "crash-reporting": ["crash", "crashlytics", "sentry"],
    "flux": ["flux"],
    "igaming": ["igaming", "gambling", "betting", "casino"],
    "localstorage": ["localstorage", "local storage"],
    "sessionstorage": ["sessionstorage", "session storage"],
    "browser-internals": ["browser internals", "browser api", "web api"],
    "design-patterns": ["design pattern"],
    "component-library": ["component librar", "design system"],
    "geospatial": ["geospatial", "gis", "mapping librar", "cartograph"],
    "three-d": ["3d", "three.js", "webgl", "point cloud"],
    "state-management": ["state management"],
    "digital-twin": ["digital twin"],
    "vue3": ["vue 3", "vue3", "vue.js 3"],
    "composition-api": ["composition api"],
    "pinia": ["pinia"],
    "vue-router": ["vue router"],
    "nuxt": ["nuxt"],
    "axios": ["axios"],
    "dynamic-forms": ["dynamic form"],
    "lazy-loading": ["lazy load", "lazy-load", "code splitting"],
    "asyncstorage": ["asyncstorage", "async storage"],
    "ota-updates": ["ota update", "over-the-air", "codepush", "eas update"],
    "swagger": ["swagger", "openapi"],
    "mvvm": ["mvvm"],
    "clean-architecture": ["clean architecture"],
    "modular-architecture": ["modular architecture", "modular feature"],
    "solid-principles": ["solid principles", "solid design"],
    "oop": ["oop", "object-oriented"],
    "clean-code": ["clean code", "clean, maintainable"],
    "feature-sliced": ["feature-sliced", "feature sliced"],
    "gesture-handler": ["gesture handler"],
    "high-load": ["high-load", "high load"],
    "erp": ["erp"],
    "mcp": ["mcp", "model context protocol"],
    "banking": ["banking", "bank"],
    "crypto": ["crypto", "blockchain", "web3"],
    "trading": ["trading", "exchange"],
    "startup": ["startup", "start-up"],
    "ownership": ["ownership", "took ownership", "own the"],
    "cursor": ["cursor"],
    "codex": ["codex"],
    "rag": ["rag", "retrieval-augmented"],
    "evals": ["eval", "evals", "evaluation harness"],
    "structured-outputs": ["structured output", "json mode", "tool schema"],
    "llm-api": ["llm api", "anthropic api", "openai api", "claude api"],
    "context-engineering": ["context engineering", "claude.md", "context window"],
    "claude-agent-sdk": ["claude agent sdk", "agent sdk"],
    "subagents": ["subagent", "sub-agent"],
    "claude-code": ["claude code"],
    "prompt-engineering": ["prompt engineering"],
    "certification": ["certified", "certification", "credly", "ccdv", "ccar"],
    "autonomy": ["autonomy", "autonomous", "autonomously", "independently"],
    "gcp": ["gcp", "google cloud"],
    "owasp": ["owasp"],
    "sast-dast": ["sast", "dast"],
    "object-storage": ["object storage", "s3", "gcs", "r2", "blob storage"],
    "gcs": ["gcs", "google cloud storage"],
    "migrations": ["migration", "migrating"],
    "indexing": ["indexing", "database index"],
    "transactions": ["transaction"],
    "file-uploads": ["file upload"],
    "forms": ["form handling", "dynamic form", "forms and file"],
    "rollbacks": ["rollback", "safe rollback"],
    "incident-response": ["production incident", "root cause", "on-call"],
    "low-spec-devices": ["low-spec", "low-end", "entry-level", "constrained device"],
    "sse": ["sse", "server-sent event", "eventsource"],
    "rtk-query": ["rtk query", "rtk-query", "redux toolkit query"],
    "payments": ["payment", "billing", "checkout", "stripe", "transaction"],
    "react-hook-form": ["react hook form", "react-hook-form"],
    "data-heavy": ["data-heavy", "data heavy", "data-dense", "data-intensive"],
    "dashboards": ["dashboard", "analytics dashboard"],
    "server-state": ["server state", "server-state", "api state"],
    "legacy-code": ["legacy code", "legacy-code", "legacy"],
    "continuous-delivery": ["continuous delivery", "weekly release", "regular release"],
    "feature-ownership": ["feature owner", "feature ownership", "end-to-end ownership"],
    "advertising": ["advertising", "ad campaign", "ads integration"],
    "realm": ["realm", "mongo realm", "realm database"],
    "pixi": ["pixi.js", "pixijs", "pixi"],
    "webgl": ["webgl", "webgpu", "canvas rendering"],
    "skeletal-animation": ["skeletal animation", "spine", "2d animation"],
    "rpc": ["rpc", "grpc", "remote procedure call"],
    "event-streaming": ["event streaming", "event stream", "kafka", "pub/sub"],
    "streaming-protocols": ["rtmp", "srt", "whip", "ll-hls", "h5live", "moq", "hls"],
    "anti-cheat": ["anti-cheat", "anticheat", "exploit prevention", "cheat detection"],
    "telemetry": ["telemetry", "distributed tracing"],
    "orchestration": ["orchestration", "kubernetes", "k8s", "ecs", "nomad"],
    "containers": ["container", "docker", "containeri"],
    "memory-management": ["memory management", "memory usage", "memory pressure",
                          "limited memory", "fps"],
    "game-client": ["game client", "game development", "gamedev", "game engine"],
    "technical-debt": ["technical debt", "tech debt"],
    "azure": ["azure", "azure repos", "azure pipelines", "azure devops"],
    "oop": ["oop", "object-oriented", "object oriented"],
    "design-patterns": ["design pattern", "design-patterns"],
    "component-library": ["component library", "design system", "ui library"],
    "ui-ux": ["ui/ux", "ux", "user experience", "usability"],
    "automated-testing": ["automated test", "automated testing", "test automation",
                          "automation"],
    "app-center": ["app center", "appcenter"],
    "npm-packages": ["npm package", "npm module", "published to npm", "react native package"],
    "device-integration": ["electronic device", "device integration", "hardware integration",
                           "on-device", "bluetooth"],
    "golang": ["golang", "go-based", "go service", "go developer", "go backend"],
    "distributed-systems": ["distributed system", "distributed architecture"],
    "cloud-native": ["cloud-native", "cloud native"],
    "mcp": ["mcp", "model context protocol"],
    "rails": ["ruby on rails", "rails"],
    "ember": ["ember.js", "emberjs", "ember"],
    "dotnet": [".net", "dotnet"],
    "csharp": ["c#", "csharp"],
    "expo-router": ["expo-router", "expo router", "file-based routing"],
    "react-router": ["react router", "remix"],
    "nx": ["nx monorepo", "nx workspace"],
    "bun": ["bun"],
    "pulumi": ["pulumi", "infrastructure as code", "terraform"],
    "revenuecat": ["revenuecat", "subscription entitlement"],
    "drm": ["drm", "widevine", "fairplay"],
    "video-streaming": ["video playback", "video streaming", "hls"],
    "in-app-purchase": ["in-app purchase", "in app purchase", "iap"],
    "hexagonal": ["hexagonal", "ports and adapters"],
    "clean-architecture": ["clean architecture", "domain-driven", "ddd"],
    "react-native-web": ["react native web", "universal app"],
    "ota": ["ota update", "over-the-air", "eas update", "codepush"],
    "testflight": ["testflight"],
    "staged-rollout": ["staged rollout", "phased release", "gradual rollout"],
    "crash-triage": ["crash triage", "crash reporting", "crash monitoring", "sentry"],
    "permissions": ["runtime permission", "app permission"],
    "list-virtualization": ["list virtualization", "flatlist", "flashlist",
                            "virtualized list"],
    "agent-harness": ["claude.md", "context.md", "subagent", "agent harness",
                      "coding harness", "agent rules"],
    "openai": ["openai", "gpt", "chatgpt"],
    "llm": ["llm", "large language model", "language model api"],
    "google-api": ["google business profile", "google my business", "google api"],
    "multi-tenant": ["multi-tenant", "multitenant", "multi-location",
                     "row level security", "tenant isolation"],
    "background-jobs": ["background job", "cron", "scheduled job", "job queue",
                        "worker queue"],
    "rds": ["aws rds", "amazon rds"],
    "uml": ["uml"],
    "ui-kit": ["ui kit", "ui-kit", "component library", "design system"],
    "data-structures": ["data structure", "big-o", "time complexity"],
    "owasp": ["owasp", "penetration testing", "pentest", "soc 2", "iso 27001"],
    "laravel": ["laravel", "yii"],
    "salesforce": ["salesforce", "veeva"],
    "html": ["html", "html5"],
    "css": ["css", "css3"],
    "scss": ["scss", "sass"],  # not "less": collides with the ordinary English word
    "design-system": ["design system", "design token"],
    "oauth": ["oauth", "oidc", "sso"],
    "video-sdk": ["zoom", "agora", "twilio", "livekit", "webrtc", "video sdk",
                  "meeting sdk", "realtime sdk"],
    "eas": ["eas", "eas build", "eas submit"],
    "cocoapods": ["cocoapods", "cocoapod"],
    "edtech": ["edtech", "e-learning"],
    "marketplace": ["marketplace"],
    "release-train": ["release train", "forced update", "device matrix"],
    "turbomodule": ["turbomodule", "turbo module"],
    "i18n": ["i18n", "internationalization", "internationalisation",
             "localization", "localisation", "multi-market"],
    "autonomy": ["autonomous", "autonomy", "independently", "sole ownership"],
    "production-monitoring": ["production monitoring", "production support",
                              "observability", "monitoring"],
}

# Lines that read like a hard requirement rather than a nice-to-have.
REQUIRED_HINT = re.compile(
    r"\b(must|required|requirement|minimum|at least|you have|we require|essential|"
    r"proven|strong (?:experience|background)|\d\+? *(?:years?|рок\w*|лет))\b",
    re.I,
)
# 'plus' only signals optional as a noun phrase. As a conjunction -- "schema
# design, migrations, transactions plus Redis caching" -- it is joining hard
# requirements, and treating it as optional silently demotes them.
NICE_HINT = re.compile(
    r"\b(nice to have|bonus|preferred|desirable|advantage|"
    r"(?:a|big|huge|major|strong|definite) plus|plus if you|would be a plus)\b",
    re.I,
)

# Postings put the hard asks under one heading and the optional ones under
# another, so the heading -- not the line -- is what classifies most terms.
REQ_HEADER = re.compile(
    r"^\W*(requirements?|qualifications?|must[- ]haves?|who you are|essential|"
    r"about you|your profile|does this (?:relate to|sound like) you|"
    r"we expect (?:that )?you|what we.re looking for|you (?:will )?have|"
    r"метч,? якщо ти|вимоги|необхідн[іi] навички|наш[іi] оч[іi]кування|"
    r"ти нам п[іi]дходиш|про тебе|що ми оч[іi]куємо|"
    r"required[^.]{0,30}(?:competenc\w+|skills)|skills? (?:and|&) experience|"
    r"skills[^.]{0,24}(?:looking for|we need)|what we.{0,3}re after|"
    r"what (?:you|we)[^.]{0,24}(?:need|looking for|expect)"
    # Ukrainian / Russian postings, which Djinni and DOU are full of
    r"|who we.{0,3}re looking for|who we are looking for"
    r"|що потрібно|який досвід потрібний|вимоги|наші очікування|що ми очікуємо"
    r"|обов.?язкові вимоги|ти нам підходиш|требования|наши ожидания"
    r"|що важливо|необхідні навички|наші вимоги)",
    re.I,
)
NICE_HEADER = re.compile(
    r"^\W*(nice[- ]to[- ]haves?|bonus(?: points)?|preferred|desirable|"
    r"good to have|pluses|would be a plus(?: if you have)?|"
    r"will be a plus|as a plus|optional"
    r"|буде перевагою|перевагою буд|буде плюсом|бажано|плюсом буде|будет плюсом)",
    re.I,
)
NEUTRAL_HEADER = re.compile(
    r"^\W*(about(?: us| the role)?|responsibilities|what you.{0,6}ll do|"
    r"benefits|perks|(?:what )?we offer|the role|our stack|how we work|"
    r"your future responsibilit(?:y|ies)|interview stages|hiring process|"
    r"що пропонуємо|ми пропонуємо|умови|тво[їi] майбутн[іi] задач[іi]|"
    r"обов.язки|про компан[іi]ю|про проєкт|про продукт|стек|"
    r"what.{0,3}s in it for you|why (?:join|us)|our benefits"
    r"|what you.{0,3}ll work on|about the (?:project|company)|our (?:mission|values)"
    r"|про нас|про проект|про компанію|про продукт|чому|ми пропонуємо"
    r"|що ви будете робити|що для нас важливо|що ви отримаєте|як відгукнутися"
    r"|умови|рекрутмент|з чим ти працюватимеш|обов.?язки|переваги роботи"
    r"|що буде в роботі|стек|що ми пропонуємо|про проєкт)",
    re.I,
)


def header_kind(line):
    """Classify a line as a section heading, or None.

    Headings are short and sit on their own line. The length gate is what stops
    a long requirement bullet that happens to open with "Досвід" or "What you"
    from being mistaken for one, now that these match as a prefix rather than
    the whole line -- Ukrainian headings carry trailing words too often to anchor.
    """
    text = line.strip()
    if not text or len(text) > 70:
        return None
    if REQ_HEADER.match(text):
        return "required"
    if NICE_HEADER.match(text):
        return "nice"
    if NEUTRAL_HEADER.match(text):
        return "neutral"
    return None

STOPWORDS = set(
    """a an and or the to of in for with on at by from as is are be been being you your we our
    us they their it its this that these those will would can could should have has had do does
    did not no if then than so such about into over under more most other some any all each own
    same very just also who whom which what when where why how team teams work working works
    role position job company experience years year skills ability able strong good great new
    across within using use used help helps support like well across including etc
    must required requirement requirements responsibilities qualifications nice bonus plus
    preferred essential looking seeking candidate candidates apply application offer benefits
    salary remote hybrid onsite office full-time part-time contract you'll we're our
    something anything everyone someone please join build building ship shipping own owning""".split()
)


# --------------------------------------------------------------------------- io


def pdf_text(path):
    reader = PdfReader(str(path))
    pages = [p.extract_text() or "" for p in reader.pages]
    return pages, "\n".join(pages)


def normalise(text):
    """Fold ligatures and smart punctuation so matching sees plain ASCII."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("–", "-").replace("—", "-").replace("·", " ")
    return re.sub(r"[ \t]+", " ", text.lower())


# Words the skills section contributes that are not skills -- "Ukrainian
# (Native)" would otherwise register "native" as a technology.
VOCAB_NOISE = {"native", "spoken", "online", "bare workflow", "app router"}


def data_file():
    """$CV_SOURCE_DIR/resume.data.json, from the environment or ../.env."""
    env_file = HERE.parent / ".env"
    source = None
    if env_file.exists():
        for line in env_file.read_text(encoding="utf8").splitlines():
            m = re.match(r"^\s*CV_SOURCE_DIR\s*=\s*(.*?)\s*$", line)
            if m and not line.lstrip().startswith("#"):
                source = m.group(1).strip("'\"")
    import os
    source = os.environ.get("CV_SOURCE_DIR") or source
    if not source:
        sys.exit(f"CV_SOURCE_DIR is not set (see {env_file})")
    return (HERE.parent / source).resolve() / "resume.data.json"


def load_vocab():
    data = json.loads(data_file().read_text(encoding="utf8"))
    terms = set(BASE_VOCAB)
    for group in data["skills"]["groups"]:
        value = group["value"]
        # Parenthesised lists are their own terms; splitting on "/" is not safe
        # here -- it would shred "CI/CD pipelines" into "ci" and "cd pipelines".
        chunks = []
        for inner in re.findall(r"\(([^)]*)\)", value):
            chunks += re.split(r"[,;]", inner)
        chunks += re.split(r"[,;]", re.sub(r"\([^)]*\)", "", value))
        for chunk in chunks:
            chunk = chunk.strip().lower().strip(".")
            if not (3 <= len(chunk) <= 30) or chunk.isdigit():
                continue
            if chunk in VOCAB_NOISE:
                continue
            # A phrase that merely wraps a term we already have ("CI/CD
            # pipelines" around "ci/cd") would be reported twice; the shorter
            # term already matches everywhere the longer one does.
            if " " in chunk and any(present(b, chunk) for b in BASE_VOCAB):
                continue
            terms.add(chunk)
    return {t for t in terms if t}


def surfaces(term):
    return ALIASES.get(term, [term.replace("-", " "), term])


def present(term, haystack):
    """Whole-word match, tolerating a plural on the last word.

    Postings and resumes disagree on number constantly -- a CV heading of
    "Databases:" has to count as evidence for a requirement worded "database".
    """
    for form in surfaces(term):
        pattern = r"(?<![a-z0-9])" + re.escape(form) + r"e?s?(?![a-z0-9])"
        if re.search(pattern, haystack):
            return True
    return False


# ------------------------------------------------------------------ 1. parsing


def check_parse(pages, raw, text):
    print("1. PARSE  -- can the system read the file")
    print("-" * 72)

    chars = len(raw.strip())
    print(f"   pages                {len(pages)}")
    print(f"   extractable text     {chars} characters")
    if chars < 500:
        print("   !! almost no text -- the file is an image, an ATS sees nothing")

    fields = {
        "email": re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", raw),
        "phone": re.search(r"\+?\d[\d ()-]{7,}\d", raw),
        "linkedin": re.search(r"linkedin", text),
        "github": re.search(r"github", text),
        "location": re.search(r"[A-Z][a-z]+(?:-[A-Z][a-z]+)*,\s*[A-Z][a-z]+", raw),
    }
    for name, hit in fields.items():
        mark = "ok  " if hit else "MISS"
        value = hit.group(0).strip() if hit else "not found"
        print(f"   {mark} {name:<16} {value}")

    print()
    sections = ["professional summary", "experience", "education", "skills"]
    found = [s for s in sections if s in text]
    for s in sections:
        print(f"   {'ok  ' if s in found else 'MISS'} section: {s.upper()}")

    # Employment entries: "Company  Mon YYYY - Mon YYYY" on one extracted line.
    span = re.compile(
        r"^(.*?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{4})"
        r"\s*[-–]\s*"
        r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{4}|Present)",
        re.M,
    )
    jobs = span.findall(raw)
    print()
    print(f"   {len(jobs)} employment entries parsed:")
    # Both ends are inclusive ("Jan 2023 - May 2023" is 5 months), and a month
    # shared by two entries (one job ends, the next starts) counts once.
    covered = set()
    bounds = []
    for company, start, end in jobs:
        s, e = to_month(start), to_month(end)
        covered.update(range(s, e + 1))
        bounds.append((s, e))
        print(f"        {company.strip():<28} {start} - {end}   ({(e - s + 1) / 12:.1f} yr)")
    if bounds:
        months = len(covered)
        print(f"   {months / 12:.1f} years of parsed experience"
              f"  ({months // 12} yr {months % 12} mo)")
        bounds.sort()
        for (_, e), (s, _) in zip(bounds, bounds[1:]):
            if s - e > 2:
                print(f"   !! {s - e} month gap between roles -- expect a question")

    hazards = sorted({c for c in raw if ord(c) > 0x2100 or 0xFB00 <= ord(c) <= 0xFB4F})
    print()
    if hazards:
        names = ", ".join(f"{c!r} (U+{ord(c):04X})" for c in hazards)
        print(f"   !! ligature/glyph hazards in the text layer: {names}")
        print("      keywords containing these will not match a literal search")
    else:
        print("   ok   no ligature or exotic-glyph hazards")
    print()


def to_month(label):
    if label.lower().startswith("present"):
        today = date.today()
        return today.year * 12 + today.month
    mon, year = label.split()
    idx = "jan feb mar apr may jun jul aug sep oct nov dec".split().index(mon[:3].lower())
    return int(year) * 12 + idx + 1


# ------------------------------------------------------------- 2 & 3. matching


def posting_terms(jd_raw, vocab):
    """Vocabulary terms the posting asks for, split by how hard the ask is."""
    jd = normalise(jd_raw)
    required, nice, mentioned = set(), set(), Counter()

    mode = None
    for line in jd.splitlines():
        kind = header_kind(line)
        if kind:
            mode = None if kind == "neutral" else kind
            continue

        hits = {t for t in vocab if present(t, line)}
        if not hits:
            continue
        mentioned.update(hits)

        # An explicit phrase on the line beats the heading it sits under.
        if NICE_HINT.search(line):
            nice |= hits
        elif REQUIRED_HINT.search(line):
            required |= hits
        elif mode == "required":
            required |= hits
        elif mode == "nice":
            nice |= hits

    for t in vocab:
        if present(t, jd):
            mentioned[t] += 1
    nice -= required
    return required, nice, mentioned


def other_frequent_terms(jd_raw, vocab, text):
    """Frequent posting words outside the tech vocabulary, e.g. domain language."""
    words = re.findall(r"[a-z][a-z+.#/-]{2,}", normalise(jd_raw))
    counts = Counter(
        w for w in words if w not in STOPWORDS and not any(present(v, w) for v in vocab)
    )
    return [(w, n) for w, n in counts.most_common(40) if n >= 2 and w not in text][:12]


# One or two digits only: a founding date like "2014 року" is not a seniority
# requirement, while "3 років" is. "5-7+ years" states a band, and the lower
# bound is what actually gates.
YEARS = re.compile(
    r"\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\+?\s*(?:years?|рок\w*|лет)", re.I
)


def find_years(jd_raw):
    """Years-of-experience asked of the candidate, not of the company.

    Agencies introduce themselves with "over 13 years of experience in Executive
    Search", which is not a seniority bar. Only the requirement sections are
    searched, deliberately with no whole-document fallback: a posting that states
    no years bar should report none, and a wrong number is worse than silence.
    """
    lines, mode = [], None
    for line in jd_raw.splitlines():
        kind = header_kind(line)
        if kind:
            mode = None if kind == "neutral" else kind
            continue
        if mode:
            lines.append(line)

    m = YEARS.search("\n".join(lines))
    if not m:
        return None
    low, high = m.group(1), m.group(2)
    return f"{low}-{high}+" if high else f"{low}+"


def screen(jd_raw, text, vocab):
    required, nice, mentioned = posting_terms(jd_raw, vocab)

    print("2. SCREEN -- hard requirements from the posting")
    print("-" * 72)
    if not required:
        print("   no lines in the posting read as hard requirements")
        print("   (no 'must have', 'required', 'N+ years' phrasing found)")
    met = sorted(t for t in required if present(t, text))
    gap = sorted(t for t in required if not present(t, text))
    for t in met:
        print(f"   ok   {t}")
    for t in gap:
        print(f"   MISS {t}   <- screened out on a strict filter")
    if required:
        print(f"\n   {len(met)}/{len(required)} hard requirements evidenced in the CV")

    years = find_years(jd_raw)
    if years:
        print(f"   posting asks for {years} years")

    print()
    print("3. KEYWORDS -- coverage of the posting's vocabulary")
    print("-" * 72)
    ranked = mentioned.most_common()
    covered = [(t, n) for t, n in ranked if present(t, text)]
    missing = [(t, n) for t, n in ranked if not present(t, text)]
    total = len(ranked)
    if total:
        pct = 100 * len(covered) / total
        print(f"   coverage  {len(covered)}/{total}  ({pct:.0f}%)")
    if nice:
        print(f"   nice-to-have terms: {', '.join(sorted(nice))}")

    if missing:
        print("\n   missing, most-repeated first (repetition = importance):")
        for t, n in missing[:20]:
            tag = " [REQUIRED]" if t in required else ""
            print(f"        {n:>2}x  {t}{tag}")
    else:
        print("\n   every vocabulary term in the posting appears in the CV")

    extra = other_frequent_terms(jd_raw, vocab, text)
    if extra:
        print("\n   frequent posting words absent from the CV (domain language):")
        print("        " + ", ".join(f"{w} ({n}x)" for w, n in extra))

    print()
    return required, gap, missing


# ------------------------------------------------------------- 4. human review


def first_look(raw, jd_raw):
    print("4. FIRST LOOK -- what a human sees before deciding to keep reading")
    print("-" * 72)
    for line in [l for l in raw.splitlines() if l.strip()][:12]:
        print(f"   | {line[:96]}")

    title = next((l.strip() for l in jd_raw.splitlines() if l.strip()), "")
    if title:
        print(f"\n   posting title: {title[:80]}")
        tokens = re.findall(r"[a-z][a-z+.#/-]*", normalise(title))
        words = {w.strip(".") for w in tokens if w not in STOPWORDS and len(w) > 2}
        roles = normalise(raw)
        overlap = {w for w in words if w in roles}
        if words:
            print(
                f"   title words echoed in the CV: "
                f"{', '.join(sorted(overlap)) if overlap else 'none'}"
                f"  ({len(overlap)}/{len(words)})"
            )
    print()


# ----------------------------------------------------------------- 5. verdict


def verdict(required, gap, missing):
    print("5. VERDICT")
    print("-" * 72)
    if gap:
        print(f"   {len(gap)} hard requirement(s) unevidenced: {', '.join(gap)}")
        print("   Fix these first -- they are the ones a strict filter screens on.")
        print("   Only claim what is true; if the experience is not there, that")
        print("   is a gap to disclose, not a keyword to insert.")
    elif required:
        print("   Every hard requirement in the posting is evidenced in the CV.")
    else:
        print("   The posting states no hard requirements this tool can detect.")
        print("   Read it yourself before trusting the coverage number.")

    if missing:
        top = ", ".join(t for t, _ in missing[:5])
        print(f"\n   Next best wins, if they are honestly yours: {top}")

    print("\n   Reminder: this is coverage, not an ATS verdict. Real systems rank")
    print("   for a recruiter rather than auto-rejecting on a score.")
    print()


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    pdf, jd_path = Path(sys.argv[1]), Path(sys.argv[2])
    pages, raw = pdf_text(pdf)
    # Collapse newlines too: a two-word term that the PDF wrapped across lines
    # ("design\npatterns") would otherwise never match a pattern with a literal
    # space in it, silently understating coverage.
    text = re.sub(r"\s+", " ", normalise(raw))
    jd_raw = jd_path.read_text(encoding="utf8")
    vocab = load_vocab()

    print()
    print(f"SCREENING  {pdf.name}  against  {jd_path.name}")
    print("=" * 72)
    print()

    check_parse(pages, raw, text)
    required, gap, missing = screen(jd_raw, text, vocab)
    first_look(raw, jd_raw)
    verdict(required, gap, missing)
    return 0


if __name__ == "__main__":
    sys.exit(main())
