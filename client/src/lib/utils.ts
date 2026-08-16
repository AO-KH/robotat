import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The name to greet someone by — the first word of what they registered as.
 *
 * Falls back to the whole string, which matters for the mononymous and for anyone whose
 * name this naive split gets wrong: a greeting addressed to someone's full name reads a
 * little formal, whereas an empty one reads as a bug.
 */
export function firstName(full: string): string {
  return full.trim().split(" ")[0] || full
}
