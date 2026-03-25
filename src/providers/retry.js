/**
 * Retry logic with configurable backoff for provider command execution.
 *
 * Usage:
 *   const result = await withRetry(
 *     () => spawnProviderCommand({ ... }),
 *     { retries: 2, retryDelayMs: 5000, isRetryable }
 *   );
 */

const DEFAULT_RETRYABLE_EXIT_CODES = new Set([
  // Common transient exit codes
  75,  // EX_TEMPFAIL (sysexits.h)
  124, // timeout
  137, // SIGKILL
  143, // SIGTERM
]);

const DEFAULT_RETRYABLE_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /429/,
  /503/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /socket hang up/i,
];

/**
 * Determine whether a command result looks like a transient failure
 * that should be retried.
 */
export function isRetryableResult(result) {
  if (result.exitCode === 0) {
    return false;
  }

  if (DEFAULT_RETRYABLE_EXIT_CODES.has(result.exitCode)) {
    return true;
  }

  const combinedOutput = `${result.stderr ?? ""} ${result.stdout ?? ""}`;
  return DEFAULT_RETRYABLE_PATTERNS.some((pattern) => pattern.test(combinedOutput));
}

/**
 * Execute `fn` and retry on transient failures.
 *
 * @param {() => Promise<T>} fn          — async function to execute
 * @param {object}           options
 * @param {number}           options.retries      — max retry attempts (0 = no retries)
 * @param {number}           options.retryDelayMs — base delay between retries
 * @param {(result: T) => boolean} [options.shouldRetry] — predicate for retrying
 * @returns {Promise<T>}
 */
export async function withRetry(fn, {
  retries = 0,
  retryDelayMs = 5_000,
  shouldRetry = isRetryableResult,
} = {}) {
  let lastResult;

  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await fn();

    if (!shouldRetry(lastResult) || attempt === retries) {
      return lastResult;
    }

    // Exponential backoff: delay × 2^attempt, capped at 60s
    const delay = Math.min(retryDelayMs * Math.pow(2, attempt), 60_000);
    await sleep(delay);
  }

  return lastResult;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
