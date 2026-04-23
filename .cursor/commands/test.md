Design the smallest high-value test coverage for this change.

Rules:
- Focus on the changed path.
- Prefer a few strong tests over broad weak coverage.
- Include regression checks for canonical business truths.

Return:
1. test targets
2. test cases
3. edge cases
4. mocks/fixtures needed
5. pass/fail criteria

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.