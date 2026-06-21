---
name: feedback-test-vi-domock-pattern
description: The codebase uses vi.doMock + dynamic import pattern to test module-level side effects (startup code). Static mocks go at top-level, per-test mocks use vi.doMock before dynamic import.
metadata:
  type: feedback
---

The `vi.doMock` + `await import('./server.js')` pattern is the accepted approach in this codebase for testing top-level `await` side effects (e.g. startup error paths in Express servers). Static module mocks (`dotenv/config`, `cors`, `express`) are declared with `vi.mock()` at the top of the test file. Per-test mocks for gateways and agents use `vi.doMock()` immediately before the dynamic `import()` call.

**Why:** Vitest hoists `vi.mock()` calls so they apply at import time; `vi.doMock()` is not hoisted and executes in-order, letting each test override only what it needs. `vi.resetModules()` in `afterEach` ensures each test gets a fresh module registry.

**How to apply:** When reviewing or writing tests for module-level startup code, expect this pattern. Flag any test that tries to spy on startup behaviour without using `vi.doMock` + dynamic import, as it will not correctly intercept module-scope execution.
