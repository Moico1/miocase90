const listingIntentPattern =
  /^\/listing\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\?resume=(?:contact|favorite|report|rate))?$/i;

export function getSafeReturnTo(value: string | undefined): string {
  if (value === '/pending') return value;
  if (value && listingIntentPattern.test(value)) return value;
  return '/';
}
