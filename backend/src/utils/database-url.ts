/**
 * WHATWG URL preserves stray percent characters, but PostgreSQL URL parsers
 * reject them as invalid percent-encoding. Normalizing only invalid percent
 * tokens keeps already encoded credentials untouched and supports legacy env
 * values whose password contains a literal `%`.
 */
export const parsePostgresUrl = (connectionString: string) =>
  new URL(connectionString.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
