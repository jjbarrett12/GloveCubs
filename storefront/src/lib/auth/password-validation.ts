export const MIN_PASSWORD_LENGTH = 8;

export type PasswordValidationIssue = "too_short" | "mismatch";

export function validateNewPasswordPair(
  password: string,
  confirm: string,
): { ok: true } | { ok: false; issue: PasswordValidationIssue; message: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      issue: "too_short",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirm) {
    return { ok: false, issue: "mismatch", message: "Passwords do not match." };
  }
  return { ok: true };
}
