Audit only the requested surface area for trust, drift, and correctness.

Rules:
- Scope to the named flow/module/files only.
- Do not audit the whole repo unless explicitly asked.
- Focus on canonical truth, data flow, schema/API contract, and user-visible failure risk.
- Prefer concrete findings over commentary.

Return:
1. scope audited
2. findings by severity
3. exact files involved
4. recommended fixes
5. go/no-go assessment

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.