# Plan: Add club_detail and club_detail_by_guid tools to NLS MCP server

> Source PRD: https://github.com/k31tha/mcp-typescript-2025-11-25/issues/1

## Architectural decisions

- **Tool registration**: both tools added inside the existing `registerNlsTools` function — automatically available over stdio and HTTP transports with no other changes
- **API routes**: `GET /api/v2/ClubApi/ClubFullDetail/{urlFriendlyName}` and `GET /api/v2/ClubApi/ClubFullDetailByGuid/{guid}`
- **Response schema**: raw JSON pass-through (no Zod validation on the response shape)
- **Error model**: `isError: true` with a descriptive message on non-OK HTTP or fetch throws; matches the `club_list` error pattern
- **Test approach**: TDD — tests are written first against the MCP response contract, with `fetch` stubbed; implementation follows

---

## Phase 1: Tests for both tools

**User stories**: 3, 4, 5, 6

### What to build

Write failing tests for `club_detail` and `club_detail_by_guid` before any implementation exists. Each test suite stubs `fetch` and exercises the tool's MCP response contract end-to-end:

- A successful API response returns `{ content: [{ type: "text", text: <json string> }] }` with no `isError`.
- A non-OK HTTP response (e.g. 404) returns `isError: true` and a message containing the status code.
- A network failure (`fetch` throws) returns `isError: true` and a message describing the error.

### Acceptance criteria

- [ ] Test file exists and runs (even though all tests fail at this point)
- [ ] Tests for `club_detail`: success, non-OK HTTP, fetch throws
- [ ] Tests for `club_detail_by_guid`: success, non-OK HTTP, fetch throws
- [ ] `fetch` is stubbed — no real network calls made during tests

---

## Phase 2: Implement `club_detail`

**User stories**: 1, 3, 4, 5, 6

### What to build

Register the `club_detail` tool inside `registerNlsTools`. It accepts a `urlFriendlyName` string parameter, calls `GET /api/v2/ClubApi/ClubFullDetail/{urlFriendlyName}`, and returns the raw JSON body as text. On a non-OK response or fetch failure it returns `isError: true` with a descriptive message.

After this phase all `club_detail` tests pass; `club_detail_by_guid` tests still fail.

### Acceptance criteria

- [ ] `club_detail` tool is registered in `registerNlsTools`
- [ ] Successful lookup returns the raw API JSON as `content[0].text`
- [ ] Non-OK HTTP response returns `isError: true` with the status code in the message
- [ ] Fetch failure returns `isError: true` with the error description in the message
- [ ] All `club_detail` tests pass

---

## Phase 3: Implement `club_detail_by_guid`

**User stories**: 2, 3, 4, 5, 6

### What to build

Register the `club_detail_by_guid` tool inside `registerNlsTools`. It accepts a `guid` string parameter, calls `GET /api/v2/ClubApi/ClubFullDetailByGuid/{guid}`, and follows the same fetch → error-handle → return-JSON pattern as `club_detail`.

After this phase all tests pass.

### Acceptance criteria

- [ ] `club_detail_by_guid` tool is registered in `registerNlsTools`
- [ ] Successful lookup returns the raw API JSON as `content[0].text`
- [ ] Non-OK HTTP response returns `isError: true` with the status code in the message
- [ ] Fetch failure returns `isError: true` with the error description in the message
- [ ] All `club_detail_by_guid` tests pass
- [ ] Full test suite is green
