const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g;
const TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]+)\b/gi;

export function sanitizeAgentErrorMessage(message: string): string {
  const sanitized = message
    .replace(EMAIL_PATTERN, "[redacted]")
    .replace(PHONE_PATTERN, "[redacted]")
    .replace(TOKEN_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) {
    return "Agent execution failed.";
  }

  return sanitized.slice(0, 500);
}
