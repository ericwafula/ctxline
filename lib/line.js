'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SEPARATOR = ' · ';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

const LIMIT_LABELS = [['five_hour', '5h'], ['seven_day', 'wk']];

const roundHalfUp = (value) => Math.floor(value + 0.5);

const paint = (code, text, color) => (color ? `${code}${text}${RESET}` : text);

function toneFor(remainingPct) {
  if (remainingPct <= 10) return RED;
  if (remainingPct <= 25) return YELLOW;
  return GREEN;
}

function timeUntil(seconds) {
  if (seconds <= 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
  return `${minutes}m`;
}

function tokenAmount(tokens) {
  if (tokens < 1_000_000) return `${roundHalfUp(tokens / 1000)}k`;
  return `${(roundHalfUp(tokens / 10_000) / 100).toFixed(2)}M`;
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const objectOr = (value) => (value && typeof value === 'object' ? value : {});

function gitBranch(directory) {
  if (!directory) return null;
  let folder = path.resolve(directory);
  for (;;) {
    let dotGit = path.join(folder, '.git');
    try {
      const stat = fs.statSync(dotGit, { throwIfNoEntry: false });
      if (stat && stat.isFile()) {
        const pointer = fs.readFileSync(dotGit, 'utf8').trim();
        if (!pointer.startsWith('gitdir:')) return null;
        dotGit = path.resolve(folder, pointer.slice('gitdir:'.length).trim());
      }
      if (fs.statSync(dotGit, { throwIfNoEntry: false })?.isDirectory()) {
        const head = fs.readFileSync(path.join(dotGit, 'HEAD'), 'utf8').trim();
        if (head.startsWith('ref: refs/heads/')) return head.slice('ref: refs/heads/'.length);
        return head.slice(0, 7) || null;
      }
    } catch {
      return null;
    }
    const parent = path.dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}

function sessionFields(payload, branch, color) {
  const fields = [];
  const model = objectOr(payload.model).display_name;
  if (model) fields.push(paint(CYAN, model, color));
  const directory = objectOr(payload.workspace).current_dir || payload.cwd;
  if (directory) {
    const place = path.basename(directory) || directory;
    fields.push(paint(DIM, branch ? `${place} ⑂ ${branch}` : place, color));
  }
  return fields;
}

function contextField(payload, color) {
  const window = objectOr(payload.context_window);
  const tokens = ['total_input_tokens', 'total_output_tokens']
    .map((key) => window[key])
    .filter(isNumber)
    .reduce((sum, value) => sum + value, 0);
  let used = window.used_percentage;
  const size = window.context_window_size;
  if (!isNumber(used)) {
    if (!tokens || !isNumber(size) || size <= 0) return null;
    used = (tokens / size) * 100;
  }
  const text = tokens
    ? `ctx ${tokenAmount(tokens)} (${roundHalfUp(used)}%)`
    : `ctx ${roundHalfUp(used)}%`;
  return paint(toneFor(100 - used), text, color);
}

function isLive(window, now) {
  return isNumber(window.used_percentage) && (!isNumber(window.resets_at) || window.resets_at > now);
}

const hasLimits = (limits) => LIMIT_LABELS.some(([key]) => isNumber(objectOr(limits[key]).used_percentage));

function limitFields(limits, now, color) {
  if (!hasLimits(limits)) return [];
  return LIMIT_LABELS.map(([key, label]) => {
    const window = objectOr(limits[key]);
    if (!isLive(window, now)) return paint(GREEN, `${label} 0%`, color);
    const used = window.used_percentage;
    let text = paint(toneFor(100 - used), `${label} ${roundHalfUp(used)}%`, color);
    if (isNumber(window.resets_at)) text += paint(DIM, `(${timeUntil(window.resets_at - now)})`, color);
    return text;
  });
}

function costField(payload, color) {
  const cost = objectOr(payload.cost).total_cost_usd;
  if (!isNumber(cost)) return null;
  const amount = (roundHalfUp(cost * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return paint(DIM, `$${amount}`, color);
}

function render(payload, now, branch = null, color = true, limits = null) {
  const fields = [
    ...sessionFields(payload, branch, color),
    contextField(payload, color),
    ...limitFields(limits === null ? objectOr(payload.rate_limits) : limits, now, color),
    costField(payload, color),
  ];
  return fields.filter(Boolean).join(SEPARATOR);
}

module.exports = { render, gitBranch, hasLimits, objectOr };
