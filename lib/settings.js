'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REFRESH_SECONDS = 60;

const claudeHome = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const settingsPath = () => path.join(claudeHome(), 'settings.json');
const previousPath = () => path.join(claudeHome(), 'ctxline-previous.json');

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const staging = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(staging, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(staging, file);
}

const isOurs = (statusLine) =>
  Boolean(statusLine) && typeof statusLine === 'object' && String(statusLine.command || '').includes('ctxline');

function install(command) {
  const settings = readJson(settingsPath());
  const current = settings.statusLine;
  const replacing = current && !isOurs(current);
  if (replacing) writeJson(previousPath(), { statusLine: current });
  settings.statusLine = {
    type: 'command',
    command,
    padding: 0,
    refreshInterval: REFRESH_SECONDS,
  };
  writeJson(settingsPath(), settings);
  return replacing
    ? `Saved your old status line to ${previousPath()}. \`ctxline uninstall\` puts it back.`
    : '';
}

function uninstall() {
  const settings = readJson(settingsPath());
  if (!isOurs(settings.statusLine)) return "ctxline isn't your status line, so nothing changed.";
  const previous = readJson(previousPath()).statusLine;
  let message;
  if (previous) {
    settings.statusLine = previous;
    message = 'Put your previous status line back.';
  } else {
    delete settings.statusLine;
    message = 'Removed the ctxline status line.';
  }
  writeJson(settingsPath(), settings);
  fs.rmSync(previousPath(), { force: true });
  return message;
}

module.exports = { install, uninstall, settingsPath, claudeHome, writeJson };
