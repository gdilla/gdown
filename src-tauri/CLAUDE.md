# Rust Backend — Tauri 2

## Package Identity
- **Package name:** `leaf`
- **Library name:** `leaf_lib`
- **main.rs** calls `leaf_lib::run()`
- **Bundle identifier:** `com.gautambanerjee.leaf`

## Structure
```
src-tauri/
├── src/
│   ├── main.rs          — Entry point
│   ├── lib.rs           — Tauri setup, menu, event handlers
│   └── commands/
│       ├── fs.rs        — File read/write/dialog commands
│       ├── export.rs    — Pandoc export commands
│       └── session.rs   — Session save/restore commands
├── Cargo.toml
├── tauri.conf.json
└── rustfmt.toml
```

## Adding a Tauri Command
1. Create the function in the appropriate `commands/*.rs` file
2. Annotate with `#[tauri::command]`
3. Register in `lib.rs` via `.invoke_handler(tauri::generate_handler![...])`
4. Add any needed permissions in `tauri.conf.json` capabilities
5. Call from frontend: `import { invoke } from '@tauri-apps/api/core'`

## Conventions
- Use `Result<T, String>` for command return types (Tauri serializes errors as strings)
- Format with `cargo fmt` (config in `rustfmt.toml`)
- Lint with `cargo clippy -- -D warnings`
- Run both: `pnpm rust:lint && pnpm rust:fmt`

## Escalation Required
- Any changes to Tauri capabilities or permissions
- New plugin additions
- Changes to the menu structure in lib.rs
