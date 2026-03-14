# Harness Engineering Guide for Leaf

This doc explains the automation infrastructure added to Leaf and how to use it effectively. The goal: **you describe what you want, Claude does the rest, you approve the PR.**

---

## The Mental Model

Think of the repo as a **self-operating system**. Every quality check is a CLI command. Every convention is written down in a file Claude can read. Every gate is mechanical — no human judgment needed to know if code is "good enough."

```
You: "Add drag-and-drop tab reordering"
  ↓
Claude: creates worktree → writes tests → implements →
        runs pnpm check → runs pnpm test → creates PR
  ↓
You: review PR, approve  ← THIS IS YOUR ONLY JOB
  ↓
Claude: merges → cleans up worktree → builds → installs
```

Your role shifts from **directing implementation** to **describing intent and reviewing output.**

---

## Worktrees: How Parallel Development Works

### Why worktrees?

Without worktrees, you can only work on one branch at a time. If Claude is building Feature A and you want Feature B started, someone has to stash, switch branches, lose context. With worktrees, **each feature gets its own directory**, all sharing the same `.git` history. Multiple Claude agents can work on different features simultaneously without conflicts.

### The directory structure

```
~/projects/Leaf/
├── src/
├── src-tauri/
├── CLAUDE.md
├── worktrees/                 ← all worktrees live here (gitignored)
│   ├── feat/tab-reorder/      ← worktree for tab reorder feature
│   ├── feat/sepia-theme/      ← worktree for sepia theme feature
│   └── fix/outline-sync/      ← worktree for outline bug fix
└── ...
```

Worktrees live **inside** `Leaf/worktrees/` — not as siblings in `~/projects/`. This keeps the parent folder clean when you have multiple apps there.

Each worktree is a **full working copy** of the repo, checked out to its own branch. They share git history but have independent `node_modules`, working files, and editor state.

### Creating a worktree (what Claude does)

```bash
# From Leaf/ (the main worktree)
git fetch origin
git worktree add worktrees/feat/my-feature -b feat/my-feature origin/main
cd worktrees/feat/my-feature
pnpm install    # each worktree needs its own node_modules
```

### Listing active worktrees

```bash
git worktree list
```

Shows all active worktrees and which branch each is on.

### Cleaning up after merge

```bash
# From the main worktree (Leaf/)
git worktree remove worktrees/feat/my-feature
git branch -d feat/my-feature
```

### Rules

1. **Always create worktrees inside `worktrees/`** — never as `../siblings` in the parent projects folder
2. **One branch per worktree** — git enforces this; you can't have two worktrees on the same branch
3. **Run `pnpm install` in each new worktree** — `node_modules` is gitignored, it doesn't carry over
4. **Clean up after merge** — stale worktrees waste disk space and show up in `git worktree list`
5. **The main worktree stays on main** — don't develop features in it; it's your stable reference point

### Spawning parallel features

This is the killer use case. You can tell Claude to work on multiple features simultaneously:

```
"Work on these two features in parallel:
1. Add a Sepia theme
2. Add Cmd+W to close the active tab"
```

Claude creates two worktrees (`worktrees/feat/sepia-theme` and `worktrees/feat/close-tab-shortcut`), works on each independently, and creates two separate PRs. No conflicts, no stashing, no context switching.

---

## Commands You Need to Know

### Daily workflow

| Command | What it does | When to use |
|---------|-------------|-------------|
| `pnpm dev` | Start the app in dev mode | Working on features locally |
| `pnpm check` | Typecheck + ESLint + Clippy | Before committing anything |
| `pnpm test` | Run all unit tests | After any code change |
| `pnpm build` | Full release build (.app + .dmg) | Ready to ship |
| `git worktree list` | See all active worktrees | Check what's in-flight |

### Claude slash commands

| Command | What it does |
|---------|-------------|
| `/qa` | Runs all quality gates and reports pass/fail |
| `/feature <description>` | Creates worktree → TDD → implement → PR |
| `/release` | Build, sign, install to /Applications |
| `/review` | Review current branch changes for issues |

### Example prompts that work well

```
/feature Add keyboard shortcut Cmd+W to close the active tab

/feature Add a "Sepia" theme with warm, paper-like colors

/qa

/release
```

### Example prompts for parallel work

```
"Work on these in parallel:
1. Add a 'Sepia' theme with warm paper-like colors
2. Fix the outline panel not updating in source mode
3. Add Cmd+Shift+T to reopen the last closed tab"
```

Claude will create three worktrees and three PRs. You review each independently.

### Example prompts for complex work

```
"Add a word count goal feature — the user sets a target in preferences,
and the status bar shows progress like '342 / 1000 words'"

"Add an image paste handler — when I Cmd+V an image, save it to an
./assets/ folder next to the file and insert a markdown image link"
```

You don't need to specify file paths, function names, or implementation details. Claude reads CLAUDE.md, checks the relevant subdirectory docs, and figures out the architecture.

---

## What's Enforced Automatically

### Pre-commit hook (runs on every `git commit`)

When you or Claude commits code, these run automatically:

1. **lint-staged** — ESLint + Prettier auto-fix on changed `.ts`/`.vue` files, `cargo fmt` on `.rs` files
2. **typecheck** — `vue-tsc --noEmit` to catch type errors

If either fails, the commit is rejected. This means **bad code physically cannot enter the repo.** You don't need to remember to lint — it happens automatically.

### CI (runs on every push/PR to main)

GitHub Actions runs the full suite:
- TypeScript check
- ESLint
- Vitest (all tests)
- Cargo clippy (Rust linting)
- Cargo fmt (Rust formatting)

If CI fails on a PR, don't merge. Ask Claude to fix it.

---

## What the Files Do

### Config files you might care about

| File | Purpose | When you'd touch it |
|------|---------|-------------------|
| `CLAUDE.md` | Master instructions for Claude | When architecture changes |
| `eslint.config.js` | Linting rules | Almost never |
| `.prettierrc` | Code formatting style | If you hate the current style |
| `vitest.config.ts` | Test runner config | Almost never |
| `.husky/pre-commit` | Pre-commit hook script | If you need to skip checks temporarily |
| `.github/workflows/ci.yml` | CI pipeline | If you add new checks |

### Claude-specific files

| File | Purpose |
|------|---------|
| `.claude/agents/qa.md` | QA agent instructions |
| `.claude/agents/feature.md` | Feature dev agent (worktree-based) |
| `.claude/commands/qa.md` | `/qa` command definition |
| `.claude/commands/feature.md` | `/feature` command definition |
| `.claude/commands/release.md` | `/release` command definition |
| `.claude/settings.json` | Allowed/denied shell commands |

### Subdirectory CLAUDE.md files

These give Claude local context when editing specific parts of the codebase:

| File | Covers |
|------|--------|
| `src/extensions/CLAUDE.md` | Tiptap extension conventions |
| `src/stores/CLAUDE.md` | Pinia store patterns |
| `src/components/source/CLAUDE.md` | CodeMirror and mode-switching |
| `src-tauri/CLAUDE.md` | Rust backend conventions |

You don't need to read these — they're for Claude. But if Claude keeps making the same mistake in a specific area, you can edit the relevant subdirectory doc to fix it.

---

## Things That Require Your Judgment

Claude will (should) ask you before:

- **Adding new dependencies** — every dep is a maintenance burden
- **Changing Tauri permissions/capabilities** — security implications
- **Architectural changes** — new stores, new patterns, restructuring
- **Anything touching mode switching** — this is where the worst bugs have been

If Claude does something without asking and it touches these areas, that's a red flag.

---

## Skipping the Pre-commit Hook

Sometimes you just need to commit and deal with lint later:

```bash
git commit --no-verify -m "wip: checkpoint"
```

Don't make this a habit. The hook exists because past-you (or past-Claude) shipped broken code.

---

## Worktree Maintenance

### Checking what's active

```bash
git worktree list
```

### Cleaning up stale worktrees

If a worktree directory was manually deleted (rm -rf) without `git worktree remove`:

```bash
git worktree prune
```

### Cleaning up everything after a batch of PRs

```bash
# See what's out there
git worktree list

# Remove each finished worktree
git worktree remove worktrees/feat/done-feature
git branch -d feat/done-feature

# Or prune any that were already deleted from disk
git worktree prune
```

---

## Test Coverage

Currently 135 tests across 11 files covering:

| Area | Tests | What's covered |
|------|-------|---------------|
| `markdownConverter.test.ts` | 26 | MD↔HTML roundtrip for all syntax elements |
| `tabs.test.ts` | 23 | Tab CRUD, reordering, deduplication |
| `frontmatter.test.ts` | 22 | YAML front-matter parsing, assembly, detection |
| `outline.test.ts` | 17 | Heading extraction from editor JSON and markdown |
| `findReplace.test.ts` | 11 | Search panel state management |
| `sidebar.test.ts` | 10 | Sidebar visibility, folder state |
| `preferences.test.ts` | 9 | Theme, font, persistence, defaults |
| `editorMode.test.ts` | 6 | Mode toggle, computed properties |
| `copyMarkdown.test.ts` | 5 | Full doc assembly from body + front-matter |
| `focusMode.test.ts` | 3 | Toggle, set state |
| `typewriterMode.test.ts` | 3 | Toggle, set state |

**What's NOT tested:** Anything that touches Tauri (`invoke` calls), the actual editor rendering, and E2E flows. Those would need Playwright/WebDriver, which isn't set up yet.

---

## Adding a New Feature (the ideal flow)

1. **Describe it** — Tell Claude what you want in plain English
2. **Claude creates worktree** — `worktrees/feat/your-feature` with its own branch
3. **Claude writes tests** — Failing tests that define "done"
4. **Claude implements** — Code that makes the tests pass
5. **Claude runs checks** — `pnpm check && pnpm test` in the worktree
6. **Claude creates PR** — With summary and test plan
7. **You review** — Look at the diff, approve or request changes
8. **Merge + cleanup** — Claude removes the worktree and branch
9. **Ship** — `/release` to build and install from main

If Claude gets stuck or the approach feels wrong, just say so. It's cheaper to course-correct early than to revert a bad PR.

---

## Common Mistakes (for humans)

- **Don't run `npm install`** — always `pnpm install`. npm will create a `package-lock.json` that conflicts.
- **Don't develop in the main worktree** — keep it on `main` as your stable reference. Use worktrees for feature work.
- **Don't create worktrees as siblings** — always `worktrees/feat-name` inside the project, never `../feat-name` (that pollutes `~/projects/`).
- **Don't forget `pnpm install` in new worktrees** — `node_modules` doesn't carry over.
- **Don't edit `src/components/SourceEditor.vue`** (the one inside components root) — it's vestigial. The real source editor is `src/components/source/SourceEditor.vue`.
- **Don't add Cmd+/ handling to App.vue** — this caused a devastating content-loss bug. The mode toggle is handled by Editor.vue and source/SourceEditor.vue separately.
- **Don't import mermaid or mathjax-full at the top level** — they're lazy-loaded for a reason (~4MB combined).
