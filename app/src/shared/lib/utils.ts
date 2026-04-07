/**
 * Utility functions for the application.
 */

/**
 * Conditionally join class names together.
 * A simplified version of clsx/classnames.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
