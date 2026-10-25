'use strict'

/**
 * Locating Chrome and printing a local HTML file to PDF with it.
 *
 * Shared by build.js and preview.js, so both get the same exit handling.
 */

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA &&
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }
  const found = CANDIDATES.find((p) => p && fs.existsSync(p))
  if (!found) {
    throw new Error(
      'No Chrome/Edge binary found. Set CHROME_PATH to your browser executable.'
    )
  }
  return found
}

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Prints htmlPath to pdfPath and returns once the file is complete.
 *
 * Chrome 152 headless no longer exits after --print-to-pdf, so rather than
 * waiting on the process we wait for the output to stop growing and then kill
 * the process group ourselves.
 * ponytail: size-settle poll, switch to CDP if it ever races.
 */
function printPdf(htmlPath, pdfPath, userDataDir, extraArgs = []) {
  fs.rmSync(pdfPath, { force: true }) // else the poll settles on a stale file

  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--hide-scrollbars',
      `--user-data-dir=${userDataDir}`,
      '--no-pdf-header-footer',
      ...extraArgs,
      `--print-to-pdf=${pdfPath}`,
      'file:///' + htmlPath.replace(/\\/g, '/'),
    ],
    { stdio: 'ignore', detached: true, windowsHide: true }
  )

  let last = -1
  for (let i = 0; i < 300 && chrome.exitCode === null; i++) {
    sleep(200)
    const size = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0
    if (size > 0 && size === last) break
    last = size
  }
  // A negative pid (kill the process group) only works on POSIX; on Windows
  // taskkill /T takes the whole Chrome process tree down instead.
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-chrome.pid)
    }
  } catch {}

  if (!fs.existsSync(pdfPath)) {
    throw new Error('Chrome did not produce a PDF at ' + pdfPath)
  }
}

module.exports = { findChrome, printPdf }
