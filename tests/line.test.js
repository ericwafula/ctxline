'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, describe, beforeEach, afterEach } = require('node:test');

const { render, gitBranch } = require('../lib/line');
const settings = require('../lib/settings');
const { currentLimits } = require('../lib/limits');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cases.json'), 'utf8'));
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ctxline-'));

describe('render', () => {
  for (const testCase of cases) {
    test(testCase.name, () => {
      assert.equal(render(testCase.payload, testCase.now, testCase.branch, false), testCase.expected);
    });
  }

  test('tone follows what is left', () => {
    const line = render({ rate_limits: { five_hour: { used_percentage: 80 }, seven_day: { used_percentage: 95 } } }, 0);
    assert.ok(line.includes('\x1b[33m5h 80%'));
    assert.ok(line.includes('\x1b[31mwk 95%'));
  });
});

describe('gitBranch', () => {
  test('reads HEAD from a parent folder', () => {
    const repo = tempDir();
    fs.mkdirSync(path.join(repo, '.git'));
    fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/workshop/level-3\n');
    const nested = path.join(repo, 'app', 'src');
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(gitBranch(nested), 'workshop/level-3');
  });

  test('follows a worktree pointer', () => {
    const root = tempDir();
    const gitdir = path.join(root, 'main', '.git', 'worktrees', 'feature');
    fs.mkdirSync(gitdir, { recursive: true });
    fs.writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/feature\n');
    const worktree = path.join(root, 'feature');
    fs.mkdirSync(worktree);
    fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${gitdir}\n`);
    assert.equal(gitBranch(worktree), 'feature');
  });

  test('detached HEAD shows a short hash', () => {
    const repo = tempDir();
    fs.mkdirSync(path.join(repo, '.git'));
    fs.writeFileSync(path.join(repo, '.git', 'HEAD'), '1c9ddeb0a1b2c3d4\n');
    assert.equal(gitBranch(repo), '1c9ddeb');
  });
});

describe('settings', () => {
  let home;
  const settingsFile = () => path.join(home, 'settings.json');
  const readSettings = () => JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));

  beforeEach(() => {
    home = tempDir();
    process.env.CLAUDE_CONFIG_DIR = home;
  });
  afterEach(() => delete process.env.CLAUDE_CONFIG_DIR);

  test('install keeps other settings and the old line', () => {
    const old = { type: 'command', command: '~/.claude/scripts/claude-statusline' };
    fs.writeFileSync(settingsFile(), JSON.stringify({ model: 'opus', statusLine: old }));
    settings.install('/bin/ctxline');
    assert.equal(readSettings().model, 'opus');
    assert.equal(readSettings().statusLine.command, '/bin/ctxline');
    assert.equal(readSettings().statusLine.refreshInterval, 60);
    settings.uninstall();
    assert.deepEqual(readSettings().statusLine, old);
    assert.equal(fs.existsSync(path.join(home, 'ctxline-previous.json')), false);
  });

  test('reinstall does not save itself as the old line', () => {
    settings.install('/bin/ctxline');
    settings.install('/usr/local/bin/ctxline');
    settings.uninstall();
    assert.equal('statusLine' in readSettings(), false);
  });

  test("uninstall leaves someone else's line alone", () => {
    fs.writeFileSync(settingsFile(), JSON.stringify({ statusLine: { type: 'command', command: 'other' } }));
    settings.uninstall();
    assert.equal(readSettings().statusLine.command, 'other');
  });
});

describe('remembered limits', () => {
  beforeEach(() => {
    process.env.CLAUDE_CONFIG_DIR = tempDir();
  });
  afterEach(() => delete process.env.CLAUDE_CONFIG_DIR);

  test('a new session shows the last limits seen', () => {
    const seen = { five_hour: { used_percentage: 8, resets_at: 2000 }, seven_day: { used_percentage: 28, resets_at: 9000 } };
    currentLimits({ rate_limits: seen }, 1000);
    assert.equal(render({}, 1500, null, false, currentLimits({}, 1500)), '5h 8%(8m) · wk 28%(2h)');
  });

  test('nothing is shown before any limits are seen', () => {
    assert.equal(render({}, 0, null, false, currentLimits({}, 0)), '');
  });
});

test('bad input prints an empty line', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'ctxline.js')], {
    input: 'not json',
    env: { ...process.env, CLAUDE_CONFIG_DIR: tempDir() },
  });
  assert.equal(output.toString(), '\n');
});
