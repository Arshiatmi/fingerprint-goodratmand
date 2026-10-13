/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to 0-9. */
export function normalizeDigits(input: string): string {
    return input.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    });
  }
