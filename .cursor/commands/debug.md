
Goal: Identify root cause with minimal tokens.

Rules:
- No speculation. Only verified facts from code, logs, or runtime.
- Prefer inspection over explanation.
- Stop when root cause is proven.

Steps:
1. Reproduce
   - State exact failing action
   - Capture exact error/output

2. Locate
   - Identify file/function/module where failure originates
   - Show only relevant snippet (≤30 lines)

3. Verify
   - Check inputs, outputs, and assumptions at failure point
   - Log actual vs expected

4. Isolate
   - Determine single failing condition
   - Eliminate unrelated paths

5. Conclude
   - Root cause (1–2 sentences max)
   - Minimal fix (no refactor, no extras)

Output format:
- Failure:
- Location:
- Evidence:
- Root cause:
- Fix: