/**
 * @param {string[]} argv Parsed CLI arguments (typically process.argv).
 * @param {string|string[]} optionNames Long option names to accept.
 * @returns {number|null} Parsed positive integer or null when the option is absent.
 */
export function parsePositiveIntegerOption(argv, optionNames) {
  const names = Array.isArray(optionNames) ? optionNames : [optionNames];
  const optionIndex = argv.findIndex((value) => names.includes(value));

  if (optionIndex === -1) {
    return null;
  }

  const rawValue = argv[optionIndex + 1];
  if (!rawValue || rawValue.startsWith("--")) {
    throw new Error(`Missing value for option "${argv[optionIndex]}".`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`Option "${argv[optionIndex]}" requires a positive integer.`);
  }

  return parsedValue;
}

/**
 * @param {string[]} argv Parsed CLI arguments (typically process.argv).
 * @param {Record<string, boolean>} optionSchema Option map where value means "expects a value".
 * @param {number} [positionalStartIndex=3]
 */
export function ensureKnownLongOptions(argv, optionSchema, positionalStartIndex = 3) {
  for (let index = positionalStartIndex; index < argv.length; index += 1) {
    const token = argv[index];

    if (typeof token !== "string" || !token.startsWith("--")) {
      continue;
    }

    assertKnownOption(token, optionSchema);

    if (optionSchema[token]) {
      assertOptionHasValue(argv, index, token);
      index += 1;
    }
  }
}

function assertKnownOption(token, schema) {
  if (!Object.prototype.hasOwnProperty.call(schema, token)) {
    throw new Error(`Unknown option "${token}".`);
  }
}

function assertOptionHasValue(argv, index, token) {
  const rawValue = argv[index + 1];
  if (rawValue === undefined || rawValue.startsWith("--")) {
    throw new Error(`Missing value for option "${token}".`);
  }
}
