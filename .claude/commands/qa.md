# /qa — Run Quality Gates

Run all quality gates for the Leaf project and report status.

## Steps
1. Run `pnpm check` (includes typecheck + lint + rust:lint)
2. Run `pnpm test` (Vitest unit tests)
3. Report pass/fail for each gate with any error details
