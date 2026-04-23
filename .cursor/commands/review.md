Review the current change for correctness and risk.

Rules:
- Review only touched files and directly connected code.
- Do not restate the implementation.
- Focus on defects, regressions, drift, and missing verification.

Return:
1. critical issues
2. medium issues
3. low issues
4. missing tests/checks
5. approval or block

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.