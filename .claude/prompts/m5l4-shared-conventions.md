# Shared Team Engineering Conventions

Use this document as the source input for the `code-review` skill. Treat it as a
starter, not as universal truth: adapt names, framework rules, testing policy and
security expectations to your team before generating the skill.

## Naming
- Variables and functions: descriptive camelCase (no abbreviations except `url`, `id`, `api`, `config`)
- Booleans: prefix with `is`, `has`, `should`, `can`
- Functions: verb-first (`getUserById`, not `user`)
- Files: match primary export (`UserService.ts` exports `UserService`)
- Constants: UPPER_SNAKE_CASE

## Error Handling
- All async operations: try/catch or `.catch()`
- Error messages include what operation failed and the relevant inputs
- No empty catch blocks; at minimum, log or rethrow the error
- HTTP errors include status code and actionable message
- Cleanup belongs in `finally` blocks when resources are opened

## TypeScript
- Zero `any` without explicit justification comment
- Prefer `interface` over `type` for object shapes
- Use `unknown` for external data, narrow with type guards
- Model states with discriminated unions, not optional fields
- Generic params: descriptive names (`TUser`, not `T`)

## Functions
- Single responsibility; if you need "and" to describe it, split it
- Max 3 parameters; use an options object beyond that
- Early returns over nested conditionals
- Query functions (`get*`, `find*`, `is*`) must be pure

## Security
- No secrets in code; environment variables only
- Validate user input at system boundaries
- SQL: parameterized statements only
- API responses never leak stack traces or internal paths

## Testing
- Test names describe behavior: "returns empty array when no results found"
- Each test owns its setup and teardown
- Specific assertions: `toEqual(expected)` instead of `toBeTruthy()`
- Cover edge cases: empty, null, boundary values and error paths
