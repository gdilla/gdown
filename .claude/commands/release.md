# /release — Build and Install

Build Leaf for macOS and install to /Applications.

## Steps
1. Run `pnpm check && pnpm test` — abort if anything fails
2. Run `pnpm build` to create the release bundle
3. Sign: `codesign --force --deep --sign - src-tauri/target/release/bundle/macos/Leaf.app`
4. Install: `cp -r src-tauri/target/release/bundle/macos/Leaf.app /Applications/`
5. Report success with build output location
