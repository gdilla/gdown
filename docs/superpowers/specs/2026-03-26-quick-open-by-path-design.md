# Quick Open by Path

Open any file on disk by typing its path into a minimal modal dialog.

## Trigger

- **Keyboard:** `Cmd+Shift+G` (macOS Finder "Go to Folder" convention)
- **Menu:** File > Open by Path... (with accelerator)

## UX Flow

1. `Cmd+Shift+G` opens a centered modal with a single text input (placeholder: "Enter file path...")
2. Real-time validation: subtle inline error if path doesn't exist or isn't a supported file
3. **Enter** opens the file and closes the modal. **Escape** closes without action.
4. If the file is already open in a tab, switches to that tab (existing `openFile` deduplication)
5. Path expansion: `~` → home dir, relative paths resolve from the currently open folder (or `$HOME` if none)

## Architecture

### New Component: `src/components/QuickOpenDialog.vue`

Teleport-based modal following InsertLinkDialog pattern:
- `<Teleport to="body">` with backdrop overlay (z-index: 9999)
- Local state: `visible` ref, `inputPath` ref, `error` ref
- Triggered via custom event: `window.dispatchEvent(new CustomEvent('gdown:quick-open'))`
- Focus input on open, blur on close
- Enter key calls `submit()`, Escape calls `close()`

### New Tauri Command: `resolve_file_path` (in `src-tauri/src/commands/fs.rs`)

```rust
#[tauri::command]
async fn resolve_file_path(path: String) -> Result<ResolveResult, String>
```

- Expands `~` to home directory
- Resolves relative paths against a provided base (or home dir)
- Returns `{ canonical_path: String, exists: bool, is_file: bool }`
- No new permissions needed — existing `fs` scope covers this

### Keyboard Shortcut Registration

- `App.vue` `handleKeydown`: `metaKey && shiftKey && key === 'g'` → dispatch `gdown:quick-open`
- `src-tauri/src/lib.rs`: Add `open_by_path` menu item in File menu with `CmdOrCtrl+Shift+G` accelerator + event handler

### File Opening

Calls existing `tabsStore.openFile(resolvedPath)` — handles tab deduplication, reading from disk, creating tab state.

## Scope

**In scope:**
- Path text input with `~` and relative path expansion
- Real-time existence validation
- Open file in new tab (or switch to existing)
- Keyboard shortcut + menu item

**Out of scope:**
- Fuzzy search / file listing / autocomplete
- Drag-and-drop
- Recent files list
- Directory opening (only files)

## Testing

- Unit tests for path resolution logic (mock Tauri invoke)
- Unit tests for QuickOpenDialog component (open/close, Enter/Escape, error display)
- Test that `Cmd+Shift+G` dispatches the correct event
