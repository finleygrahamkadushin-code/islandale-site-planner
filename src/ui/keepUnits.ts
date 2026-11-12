/**
 * Keep a number and its unit on one line (R9.5): the side panels' values
 * wrapped as "1,600 sq" then "ft", or "7" then "%". Spaces between a number
 * and a unit (and inside "sq ft"), and after a + or / before a number,
 * become no-break spaces; every other space stays, so a long value still
 * wraps between its parts.
 */
const NB = ' '
const NUMBER_THEN_UNIT = /(\d)[ ]+(?=(?:sq ft|ft|in|%|°|covered|deck|fl)(?![A-Za-z]))/g

/** A + or / before a number: tied to the number, so a line breaks before the sign, not after it. */
const SIGN_THEN_NUMBER = /([+/])[ ]+(?=\d)/g

export function keepUnits(text: string): string {
  return text.replace(NUMBER_THEN_UNIT, `$1${NB}`).replace(/sq ft/g, `sq${NB}ft`).replace(SIGN_THEN_NUMBER, `$1${NB}`)
}
