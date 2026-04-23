Perform a release-readiness pass for the changed feature only.

Rules:
- Do not review unrelated areas.
- Check user-visible flow, data persistence, canonical truth, and rollback risk.
- Be strict and concise.

Return:
1. release scope
2. must-fix issues
3. should-fix issues
4. verification checklist
5. ship / do-not-ship decision

Constraints:
- Read only the minimum number of files required.
- Do NOT scan the entire repository.
- Do NOT analyze unrelated systems.
- If more context is needed, stop and ask instead of exploring.
- Keep output concise and non-redundant.