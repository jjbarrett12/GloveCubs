Implement the requested change with the smallest safe diff.

Rules:
- Do not scan unrelated code.
- Preserve canonical truths and existing contracts.
- Do not introduce placeholder logic or fake fallbacks.
- Keep naming and structure consistent with nearby code.
- Run only the most relevant validation for touched files.

Return:
1. files changed
2. what changed
3. verification run
4. remaining risks

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.