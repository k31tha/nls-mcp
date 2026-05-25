Implement the plan described in $ARGUMENTS. Follow these steps in order:

1. Read the plan file from `plans/` to understand what needs to be built and the acceptance criteria.
2. Create a feature branch named after the plan file (e.g. `plans/foo-bar.md` → `git checkout -b feature/foo-bar`).
3. Implement all phases in the plan, editing only the files the plan calls for.
4. Verify `pnpm build` passes with no TypeScript errors.
5. Commit the changes with a meaningful message referencing the plan.
6. Open a PR against main using `gh pr create`. The PR description should list the acceptance criteria from the plan as a checklist.
7. Stop. Do not merge. Post the PR URL and wait for review.
