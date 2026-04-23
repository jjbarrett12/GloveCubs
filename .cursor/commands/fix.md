Fix the reported issue at the root cause, not the symptom.

Rules:
- Start from the failing path only.
- Do not broaden scope unless required by the root cause.
- Preserve canonical data flow.
- Add or update targeted verification if possible.

Return:
1. root cause
2. files changed
3. exact fix
4. verification
5. residual risk

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.