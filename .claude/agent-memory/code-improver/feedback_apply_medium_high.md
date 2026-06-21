---
name: apply-medium-high-fixes
description: When reviewing files, apply Medium/High-impact issues directly rather than only reporting them
metadata:
  type: feedback
---

When the user asks for a code review, apply any Medium or High impact improvements directly to the files. Report what was changed (or that no changes were needed) rather than presenting all findings as suggestions only.

**Why:** User explicitly requested this workflow: "Apply any Medium/High-impact suggestions to the files."

**How to apply:** After the analysis section, make the edits with Edit tool. Always keep test assertion strings in sync when changing log/error messages in source.
