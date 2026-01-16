const patterns: RegExp[] = [
  // GitHub tokens
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  // Slack tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // AWS access key id
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Generic "secret=..."
  /\b(secret|token|password|api[_-]?key)\s*[:=]\s*[^\s]{8,}\b/gi
]

export function redactSecrets(input: string): string {
  let out = input
  for (const re of patterns) out = out.replaceAll(re, '[REDACTED]')
  return out
}

