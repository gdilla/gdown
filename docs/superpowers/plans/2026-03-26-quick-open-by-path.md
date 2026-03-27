# Quick Open by Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Cmd+Shift+G` modal dialog that opens any file on disk by typing its path (with `~` expansion).

**Architecture:** A new `QuickOpenDialog.vue` component (Teleport-based, same pattern as InsertLinkDialog) triggered via `gdown:quick-open` custom event. A new Rust command `resolve_file_path` handles `~` expansion and path validation. The keyboard shortcut is registered in both App.vue and the Tauri menu in lib.rs.

**Tech Stack:** Vue 3, Tauri 2, Rust, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/QuickOpenDialog.vue` | Modal UI: text input, validation, open action |
| Create | `src/__tests__/components/QuickOpenDialog.test.ts` | Component tests |
| Modify | `src/App.vue` | Add `Cmd+Shift+G` shortcut + mount QuickOpenDialog + listen for menu event |
| Modify | `src-tauri/src/commands/fs.rs` | Add `resolve_file_path` command |
| Modify | `src-tauri/src/lib.rs` | Register command + add menu item + emit event |

---

### Task 1: Rust `resolve_file_path` Command

**Files:**
- Modify: `src-tauri/src/commands/fs.rs`
- Modify: `src-tauri/src/lib.rs:8` (add to use statement)
- Modify: `src-tauri/src/lib.rs:171-194` (register in invoke_handler)

- [ ] **Step 1: Add the `resolve_file_path` command to `src-tauri/src/commands/fs.rs`**

Add at the end of the file, before the `#[cfg(test)]` block:

```rust
/// Result of resolving a file path.
#[derive(Debug, Clone, Serialize)]
pub struct ResolveResult {
    /// The canonicalized absolute path (after ~ expansion).
    pub canonical_path: String,
    /// Whether the path exists on disk.
    pub exists: bool,
    /// Whether the path points to a file (not a directory).
    pub is_file: bool,
}

/// Tauri command: Resolves a file path with ~ expansion and validates existence.
///
/// # Arguments
/// * `path` - The path to resolve. Supports `~` for home directory.
/// * `base_dir` - Optional base directory for resolving relative paths. Falls back to home dir.
#[tauri::command]
pub fn resolve_file_path(path: String, base_dir: Option<String>) -> Result<ResolveResult, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    // Expand ~ to home directory
    let expanded = if path.starts_with('~') {
        let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
        if path == "~" {
            home
        } else {
            // ~/foo/bar → /Users/name/foo/bar
            home.join(&path[2..])
        }
    } else {
        let p = PathBuf::from(&path);
        if p.is_absolute() {
            p
        } else {
            // Resolve relative path against base_dir or home
            let base = base_dir
                .map(PathBuf::from)
                .or_else(|| dirs::home_dir())
                .unwrap_or_else(|| PathBuf::from("/"));
            base.join(&path)
        }
    };

    let exists = expanded.exists();
    let is_file = expanded.is_file();

    // Use canonicalize if the path exists, otherwise return the expanded path
    let canonical = if exists {
        expanded
            .canonicalize()
            .unwrap_or(expanded)
    } else {
        expanded
    };

    Ok(ResolveResult {
        canonical_path: canonical.to_string_lossy().to_string(),
        exists,
        is_file,
    })
}
```

- [ ] **Step 2: Add `dirs` crate to Cargo.toml**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
dirs = "6"
```

- [ ] **Step 3: Export the new command from `fs.rs` and register in `lib.rs`**

In `src-tauri/src/lib.rs`, update the `use` statement at line 8:

```rust
use commands::fs::{
    copy_image_to_assets, get_file_modified_time, read_directory_shallow, read_directory_tree,
    read_file, resolve_file_path, write_file, write_image_to_assets,
};
```

In the `invoke_handler` macro (around line 171), add `resolve_file_path` to the list:

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    read_directory_tree,
    read_directory_shallow,
    read_file,
    write_file,
    get_file_modified_time,
    open_folder_dialog,
    open_file_dialog,
    save_file_dialog,
    get_pending_open_files,
    save_session_state,
    load_session_state,
    copy_image_to_assets,
    write_image_to_assets,
    resolve_file_path,
    check_pandoc,
    get_export_formats,
    get_export_config,
    export_document,
    export_save_dialog,
    find_claude_project_dir,
    list_files_with_mtime,
    find_instruction_files,
])
```

- [ ] **Step 4: Add Rust tests for `resolve_file_path`**

Add to the existing `#[cfg(test)] mod tests` block in `fs.rs`:

```rust
#[test]
fn test_resolve_file_path_absolute() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("test.md");
    fs::File::create(&file).unwrap();

    let result = resolve_file_path(file.to_string_lossy().to_string(), None).unwrap();
    assert!(result.exists);
    assert!(result.is_file);
    assert_eq!(result.canonical_path, file.canonicalize().unwrap().to_string_lossy());
}

#[test]
fn test_resolve_file_path_nonexistent() {
    let result = resolve_file_path("/nonexistent/file.md".to_string(), None).unwrap();
    assert!(!result.exists);
    assert!(!result.is_file);
}

#[test]
fn test_resolve_file_path_directory() {
    let dir = tempdir().unwrap();
    let result = resolve_file_path(dir.path().to_string_lossy().to_string(), None).unwrap();
    assert!(result.exists);
    assert!(!result.is_file);
}

#[test]
fn test_resolve_file_path_empty() {
    let result = resolve_file_path("".to_string(), None);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("empty"));
}

#[test]
fn test_resolve_file_path_tilde() {
    // ~ should resolve to home directory (which exists)
    let result = resolve_file_path("~".to_string(), None).unwrap();
    assert!(result.exists);
    assert!(!result.is_file); // home dir is a directory
}

#[test]
fn test_resolve_file_path_relative_with_base() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("doc.md");
    fs::File::create(&file).unwrap();

    let result = resolve_file_path(
        "doc.md".to_string(),
        Some(dir.path().to_string_lossy().to_string()),
    )
    .unwrap();
    assert!(result.exists);
    assert!(result.is_file);
}
```

- [ ] **Step 5: Verify Rust compiles and tests pass**

Run:
```bash
cd src-tauri && cargo test -- --test-threads=1
```
Expected: all tests pass, including the new `resolve_file_path` tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/fs.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: add resolve_file_path Tauri command with ~ expansion"
```

---

### Task 2: Tauri Menu Item for "Open by Path..."

**Files:**
- Modify: `src-tauri/src/lib.rs:196-278` (menu setup)
- Modify: `src-tauri/src/lib.rs:386-484` (menu event handler)

- [ ] **Step 1: Add the menu item definition**

In `lib.rs`, after the `open_folder` menu item definition (around line 204), add:

```rust
let open_by_path = MenuItemBuilder::with_id("open_by_path", "Open by Path...")
    .accelerator("CmdOrCtrl+Shift+G")
    .build(app)?;
```

- [ ] **Step 2: Add the menu item to the File menu**

In the `file_menu` builder (around line 260-278), add `&open_by_path` after `&open_folder`:

```rust
let file_menu = SubmenuBuilder::new(app, "File")
    .item(&new_file)
    .item(&open_file)
    .item(&open_folder)
    .item(&open_by_path)
    .item(&open_recent_menu)
    .separator()
    // ... rest unchanged
```

- [ ] **Step 3: Add the menu event handler**

In the `on_menu_event` match block, after the `"open_folder"` arm (around line 403), add:

```rust
"open_by_path" => {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("menu-open-by-path", ());
    }
}
```

- [ ] **Step 4: Verify Rust compiles**

Run:
```bash
cd src-tauri && cargo check
```
Expected: compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add 'Open by Path...' menu item with Cmd+Shift+G accelerator"
```

---

### Task 3: QuickOpenDialog Vue Component

**Files:**
- Create: `src/components/QuickOpenDialog.vue`

- [ ] **Step 1: Create the component**

Create `src/components/QuickOpenDialog.vue`:

```vue
<template>
  <Teleport to="body">
    <div v-if="visible" class="quick-open-overlay" @click.self="close">
      <div class="quick-open-box">
        <div class="quick-open-field">
          <input
            ref="inputEl"
            v-model="inputPath"
            type="text"
            placeholder="Enter file path (supports ~ for home)..."
            @keydown.enter="submit"
            @keydown.escape="close"
            @input="clearError"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
        <div v-if="error" class="quick-open-error">{{ error }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from '../stores/tabs'
import { useSidebarStore } from '../stores/sidebar'

interface ResolveResult {
  canonical_path: string
  exists: boolean
  is_file: boolean
}

const tabsStore = useTabsStore()
const sidebarStore = useSidebarStore()

const visible = ref(false)
const inputPath = ref('')
const error = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

function open() {
  inputPath.value = ''
  error.value = ''
  visible.value = true
  nextTick(() => {
    inputEl.value?.focus()
  })
}

function close() {
  visible.value = false
}

function clearError() {
  error.value = ''
}

async function submit() {
  const path = inputPath.value.trim()
  if (!path) return

  try {
    const result = await invoke<ResolveResult>('resolve_file_path', {
      path,
      baseDir: sidebarStore.rootPath ?? undefined,
    })

    if (!result.exists) {
      error.value = 'File does not exist'
      return
    }

    if (!result.is_file) {
      error.value = 'Path is a directory, not a file'
      return
    }

    await tabsStore.openFile(result.canonical_path)
    close()
  } catch (err) {
    error.value = String(err)
  }
}

function handleQuickOpen() {
  if (visible.value) {
    close()
  } else {
    open()
  }
}

onMounted(() => {
  window.addEventListener('gdown:quick-open', handleQuickOpen)
})

onUnmounted(() => {
  window.removeEventListener('gdown:quick-open', handleQuickOpen)
})
</script>

<style scoped>
.quick-open-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  z-index: 9999;
}

.quick-open-box {
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  padding: 8px;
  width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.quick-open-field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  font-size: 14px;
  font-family: var(--font-mono, ui-monospace, monospace);
  outline: none;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.quick-open-field input:focus {
  border-color: var(--accent-color, #4183c4);
}

.quick-open-error {
  padding: 4px 12px 4px;
  font-size: 12px;
  color: var(--error-color, #d32f2f);
}
</style>
```

- [ ] **Step 2: Verify the file was created**

Run:
```bash
ls -la src/components/QuickOpenDialog.vue
```
Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickOpenDialog.vue
git commit -m "feat: add QuickOpenDialog component for open-by-path"
```

---

### Task 4: Wire QuickOpenDialog into App.vue

**Files:**
- Modify: `src/App.vue:34-39` (template — add component)
- Modify: `src/App.vue:42-50` (script — add import)
- Modify: `src/App.vue:100-115` (script — add unlisten variable)
- Modify: `src/App.vue:117-267` (script — add keyboard shortcut)
- Modify: `src/App.vue:275-299` (script — add menu event listener in onMounted)

- [ ] **Step 1: Add the component to the template**

In `src/App.vue` template, after the `<ExportToast />` line (around line 38), add:

```html
    <QuickOpenDialog />
```

- [ ] **Step 2: Add the import**

In the `<script setup>` imports section (around lines 42-50), add:

```ts
import QuickOpenDialog from './components/QuickOpenDialog.vue'
```

- [ ] **Step 3: Add the unlisten variable**

After the `let unlistenPrintPdf` line (around line 115), add:

```ts
let unlistenOpenByPath: UnlistenFn | null = null
```

- [ ] **Step 4: Add the keyboard shortcut**

In the `handleKeydown` function, after the `Cmd+Shift+O` block (around line 145), add:

```ts
  // Cmd+Shift+G: Open by path (macOS Finder "Go to Folder" shortcut)
  if (e.metaKey && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    return
  }
```

- [ ] **Step 5: Add the Tauri menu event listener**

In the `onMounted` async block, after the `menu-open-folder` listener (around line 299), add:

```ts
    // File > Open by Path (Cmd+Shift+G)
    unlistenOpenByPath = await listen('menu-open-by-path', () => {
      window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    })
```

- [ ] **Step 6: Clean up the listener in onUnmounted**

In the `onUnmounted` block, add alongside other unlisten calls:

```ts
  unlistenOpenByPath?.()
```

- [ ] **Step 7: Verify TypeScript compiles**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.vue
git commit -m "feat: wire QuickOpenDialog into App.vue with Cmd+Shift+G shortcut"
```

---

### Task 5: Component Tests

**Files:**
- Create: `src/__tests__/components/QuickOpenDialog.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/__tests__/components/QuickOpenDialog.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QuickOpenDialog from '../../components/QuickOpenDialog.vue'

// Mock Tauri invoke for granular control
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('QuickOpenDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
  })

  it('is hidden by default', () => {
    const wrapper = mount(QuickOpenDialog)
    expect(wrapper.find('.quick-open-overlay').exists()).toBe(false)
  })

  it('opens when gdown:quick-open event is dispatched', async () => {
    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-overlay').exists()).toBe(true)
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('closes when Escape is pressed', async () => {
    const wrapper = mount(QuickOpenDialog)

    // Open dialog
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.quick-open-overlay').exists()).toBe(true)

    // Press Escape
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-overlay').exists()).toBe(false)
  })

  it('closes when clicking the overlay backdrop', async () => {
    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    await wrapper.find('.quick-open-overlay').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-overlay').exists()).toBe(false)
  })

  it('shows error when file does not exist', async () => {
    mockInvoke.mockResolvedValue({
      canonical_path: '/nonexistent/file.md',
      exists: false,
      is_file: false,
    })

    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('/nonexistent/file.md')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()
    // Wait for async invoke to resolve
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-error').text()).toBe('File does not exist')
  })

  it('shows error when path is a directory', async () => {
    mockInvoke.mockResolvedValue({
      canonical_path: '/some/directory',
      exists: true,
      is_file: false,
    })

    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('/some/directory')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-error').text()).toBe('Path is a directory, not a file')
  })

  it('calls openFile and closes on valid path', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_file_path') {
        return Promise.resolve({
          canonical_path: '/Users/test/notes.md',
          exists: true,
          is_file: true,
        })
      }
      // read_file call from openFile
      if (cmd === 'read_file') {
        return Promise.resolve('# Notes')
      }
      return Promise.resolve(null)
    })

    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('/Users/test/notes.md')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()

    // Dialog should close after successful open
    expect(wrapper.find('.quick-open-overlay').exists()).toBe(false)
    // resolve_file_path was called
    expect(mockInvoke).toHaveBeenCalledWith('resolve_file_path', {
      path: '/Users/test/notes.md',
      baseDir: undefined,
    })
  })

  it('does not submit when input is empty', async () => {
    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    // Enter with empty input
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    // invoke should not have been called
    expect(mockInvoke).not.toHaveBeenCalled()
    // Dialog should stay open
    expect(wrapper.find('.quick-open-overlay').exists()).toBe(true)
  })

  it('clears error when typing', async () => {
    mockInvoke.mockResolvedValue({
      canonical_path: '/nonexistent/file.md',
      exists: false,
      is_file: false,
    })

    const wrapper = mount(QuickOpenDialog)

    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('/nonexistent/file.md')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-error').exists()).toBe(true)

    // Typing should clear the error
    await wrapper.find('input').trigger('input')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.quick-open-error').exists()).toBe(false)
  })

  it('toggles off when gdown:quick-open dispatched while open', async () => {
    const wrapper = mount(QuickOpenDialog)

    // Open
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.quick-open-overlay').exists()).toBe(true)

    // Dispatch again — should close
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.quick-open-overlay').exists()).toBe(false)
  })

  it('cleans up event listener on unmount', async () => {
    const wrapper = mount(QuickOpenDialog)
    wrapper.unmount()

    // After unmount, dispatching the event should not throw
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
  })
})
```

- [ ] **Step 2: Run the tests**

Run:
```bash
pnpm test -- src/__tests__/components/QuickOpenDialog.test.ts
```
Expected: all tests pass.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: all tests pass (existing + new).

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/components/QuickOpenDialog.test.ts
git commit -m "test: add QuickOpenDialog component tests"
```

---

### Task 6: Quality Gates and Final Review

**Files:** None (verification only)

- [ ] **Step 1: Run all quality gates**

Run:
```bash
pnpm check && pnpm test
```
Expected: typecheck, lint, rust:lint all pass. All tests pass.

- [ ] **Step 2: Run Rust format check**

Run:
```bash
pnpm rust:fmt
```
Expected: no formatting issues.

- [ ] **Step 3: Self-review the diff**

Run:
```bash
git diff main --stat && git diff main
```

Verify:
- No `any` types introduced
- No hardcoded colors (all use CSS custom properties)
- No unnecessary imports or dead code
- Component follows existing patterns (Teleport, custom event, local refs)

- [ ] **Step 4: Create PR**

```bash
git push -u origin feat/quick-open-by-path
gh pr create --title "feat: quick open file by path (Cmd+Shift+G)" --body "$(cat <<'EOF'
## Summary
- Adds a Quick Open dialog triggered by `Cmd+Shift+G` (or File > Open by Path...)
- Type any file path to open it directly — supports `~` for home directory and relative paths
- Real-time validation with inline error messages
- New `resolve_file_path` Rust command handles path expansion and validation

## Test plan
- [ ] `Cmd+Shift+G` opens the Quick Open dialog
- [ ] Typing a valid file path and pressing Enter opens it in a new tab
- [ ] `~` expands to home directory (e.g., `~/Documents/notes.md`)
- [ ] Relative paths resolve against open folder (or home if no folder open)
- [ ] Non-existent paths show "File does not exist" error
- [ ] Directory paths show "Path is a directory, not a file" error
- [ ] Escape closes the dialog
- [ ] Clicking backdrop closes the dialog
- [ ] File > Open by Path... menu item works
- [ ] All quality gates pass: `pnpm check && pnpm test`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
