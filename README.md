# ctxline

A status line for Claude Code that shows how much context you've used and how close you are to your usage limits.

```
Opus 5.5 · stovetime ⑂ main · ctx 186k (19%) · 5h 8%(3h) · wk 28%(2d) · $8.30
```

| Field | Meaning |
|---|---|
| `Opus 5.5` | The model |
| `stovetime ⑂ main` | Folder and git branch |
| `ctx 186k (19%)` | Tokens in the context window, and the share of the window they fill |
| `5h 8%(3h)` | Share of your 5-hour limit used, and time until it resets |
| `wk 28%(2d)` | Same for the weekly limit |
| `$8.30` | What the session would cost at API prices |

Each field turns yellow when a quarter or less is left, and red at a tenth. Fields with no data yet are left out. The limits only appear on Pro, Max and Ultra plans, after the first reply in a session.

It uses no tokens. Claude Code runs it on your machine and sends it the session details as JSON. Nothing it prints goes to the model.

## Install

With Homebrew:

```bash
brew install ericwafula/tools/ctxline
ctxline install
```

With uv:

```bash
uv tool install git+https://github.com/ericwafula/ctxline
ctxline install
```

With Node 18 or newer:

```bash
npm install -g github:ericwafula/ctxline
ctxline install
```

`ctxline install` adds a `statusLine` entry to `~/.claude/settings.json`, using the full path to the command so it works from the desktop app too. If you already had a status line, it's saved to `~/.claude/ctxline-previous.json`.

The Node version records the path of the Node it was installed with. If you remove that Node version (with nvm, say), run `ctxline install` again.

## Remove

```bash
ctxline uninstall
```

This puts back the status line you had before, or removes the entry if there wasn't one. Then uninstall the package with `brew uninstall ctxline`, `uv tool uninstall ctxline` or `npm uninstall -g ctxline`.

## Try it without Claude Code

```bash
echo '{"model":{"display_name":"Opus"},"context_window":{"total_input_tokens":42000,"context_window_size":200000}}' | ctxline
```

Set `NO_COLOR=1` for plain text. `CLAUDE_CONFIG_DIR` changes where settings are written.

## Development

The Python version lives in `src/ctxline`, the Node version in `lib` and `bin`. Both are tested against the same cases in `tests/fixtures/cases.json`, so they print identical lines.

```bash
python3 -m unittest discover -s tests
```

```bash
npm test
```
