/**
 * Format a number as virtual chips with "₣" symbol.
 */
export function formatChips(amount: number): string {
  return `₣ ${amount.toLocaleString("es-VE")}`;
}

/**
 * Generate a random avatar URL from a seed (uses DiceBear).
 */
export function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/8.x/lorelei/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Generate a unique username from an email address.
 */
export function usernameFromEmail(email: string): string {
  const base = email.split("@")[0].replace(/[^a-z0-9]/gi, "");
  const suffix = Math.floor(Math.random() * 1000);
  return `${base}${suffix}`;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
