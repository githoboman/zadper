// The canonical form for an EVM address. Validation remains with each
// caller because some boundaries accept a prefixed value before checking size.
export function normalizeAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}
