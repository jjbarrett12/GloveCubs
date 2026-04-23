Create a minimal execution plan for this change.

Rules:
- Keep scope tight.
- Avoid unrelated refactors.
- Prefer the fewest files possible.
- Call out any schema/API dependency explicitly.

Return:
1. assumptions
2. files to inspect
3. ordered implementation steps
4. verification steps
5. stop conditions / unknowns

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.