'use strict'

/**
 * Paths for the CV tooling, read from ../.env (daemons/cv-maker/.env).
 *
 *   CV_SOURCE_DIR  folder with the source of truth: resume.data.json,
 *                  master-resume.md, amendments.md, optional resume.<lang>.json
 *   CV_OUTPUT_DIR  folder that receives one subfolder per application
 *   CV_FILE_NAME   file name of the generated PDF
 *   CHROME_PATH    optional, browser used to print the PDF
 *
 * Relative paths are resolved against the folder that holds the .env file.
 * Real environment variables win over the file.
 */

const fs = require('fs')
const path = require('path')

const DAEMON = path.resolve(__dirname, '..')
const ENV_FILE = path.join(DAEMON, '.env')

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {}
  const out = {}
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const fileEnv = readEnvFile()
const get = (k) => process.env[k] || fileEnv[k]

function dir(key) {
  const v = get(key)
  if (!v) {
    throw new Error(`${key} is not set. Copy .env.example to .env in ${DAEMON} and fill it in.`)
  }
  return path.resolve(DAEMON, v)
}

const SOURCE_DIR = dir('CV_SOURCE_DIR')
const OUTPUT_DIR = dir('CV_OUTPUT_DIR')
const OUT_NAME = get('CV_FILE_NAME') || 'cv.pdf'
if (get('CHROME_PATH')) process.env.CHROME_PATH = get('CHROME_PATH')

const DATA_FILE = path.join(SOURCE_DIR, 'resume.data.json')

/** Python inside tools/.venv, on Windows or POSIX. */
function venvPython() {
  const win = path.join(__dirname, '.venv', 'Scripts', 'python.exe')
  const posix = path.join(__dirname, '.venv', 'bin', 'python')
  return fs.existsSync(win) ? win : posix
}

/**
 * Number of dated entries the PDF parser should find, for the layout gates:
 * EXPERIENCE jobs plus PROJECTS items (they print the same "name  dates" line).
 */
function expectedJobs() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  return data.experience.jobs.length + (data.projects ? data.projects.items.length : 0)
}

module.exports = { SOURCE_DIR, OUTPUT_DIR, OUT_NAME, DATA_FILE, venvPython, expectedJobs }
