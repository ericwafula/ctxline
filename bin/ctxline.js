#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { render, gitBranch } = require('../lib/line');
const settings = require('../lib/settings');
const { currentLimits } = require('../lib/limits');
const { version } = require('../package.json');

const USAGE = `usage: ctxline [install | uninstall | --version]

  (piped JSON)  print the status line for a Claude Code session
  install       make ctxline your Claude Code status line
  uninstall     remove it and restore the status line you had before
`;

const shellQuote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;

function ownCommand() {
  return `${shellQuote(process.execPath)} ${shellQuote(fs.realpathSync(__filename))}`;
}

function printLine() {
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {}
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
  const directory = (payload.workspace && payload.workspace.current_dir) || payload.cwd;
  const color = !process.env.NO_COLOR;
  const now = Date.now() / 1000;
  console.log(render(payload, now, gitBranch(directory), color, currentLimits(payload, now)));
}

function runInstall() {
  const command = ownCommand();
  if (command.includes('/_npx/')) {
    console.error('Install it for good first: npm install -g ctxline, then run ctxline install.');
    return 1;
  }
  const note = settings.install(command);
  console.log(`ctxline is now your status line (${settings.settingsPath()}).`);
  if (note) console.log(note);
  return 0;
}

function main(args) {
  if (args.length === 0) {
    if (process.stdin.isTTY) {
      process.stdout.write(USAGE);
      return 0;
    }
    try {
      printLine();
    } catch {
      console.log('');
    }
    return 0;
  }
  if (args[0] === 'install') return runInstall();
  if (args[0] === 'uninstall') {
    console.log(settings.uninstall());
    return 0;
  }
  if (args[0] === '--version' || args[0] === '-V') {
    console.log(version);
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
