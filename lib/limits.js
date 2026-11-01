'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hasLimits, objectOr } = require('./line');
const { claudeHome, writeJson } = require('./settings');

const memoryPath = () => path.join(claudeHome(), 'cache', 'ctxline-limits.json');

function currentLimits(payload, now) {
  const live = objectOr(payload.rate_limits);
  if (hasLimits(live)) {
    try {
      writeJson(memoryPath(), live);
    } catch {}
    return live;
  }
  try {
    const remembered = JSON.parse(fs.readFileSync(memoryPath(), 'utf8'));
    return remembered && typeof remembered === 'object' ? remembered : live;
  } catch {
    return live;
  }
}

module.exports = { currentLimits };
