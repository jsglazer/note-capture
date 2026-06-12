import { COMMON_MISSPELLINGS } from "./corrections";

// nspell is a pure-JS Hunspell-style checker; bundled at build time.
// Loaded only if a dictionary is available, otherwise we fall back to COMMON_MISSPELLINGS.
import nspellFactory from "nspell";

export interface Flag {
  word: string;
  suggestion: string | null;
}

export interface CheckResult {
  /** Text with available corrections applied (used in auto-correct mode). */
  corrected: string;
  /** Misspelled words found (used in flag mode). */
  flags: Flag[];
}

/** Apply the casing of `original` to `replacement`. */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export class SpellChecker {
  private speller: ReturnType<typeof nspellFactory> | null = null;

  /**
   * Try to load a Hunspell dictionary from the plugin folder. If `en_US.aff` / `en_US.dic`
   * are present, full spell checking is enabled; otherwise only COMMON_MISSPELLINGS is used.
   */
  async init(readFile: (rel: string) => Promise<string | null>): Promise<boolean> {
    try {
      const aff = await readFile("en_US.aff");
      const dic = await readFile("en_US.dic");
      if (aff && dic) {
        this.speller = nspellFactory({ aff, dic });
        return true;
      }
    } catch (e) {
      console.warn("Note Capture: failed to load Hunspell dictionary, using fallback map.", e);
    }
    return false;
  }

  get hasDictionary(): boolean {
    return this.speller !== null;
  }

  private analyze(word: string): { misspelled: boolean; suggestion: string | null } {
    const lower = word.toLowerCase();

    if (Object.prototype.hasOwnProperty.call(COMMON_MISSPELLINGS, lower)) {
      return { misspelled: true, suggestion: matchCase(word, COMMON_MISSPELLINGS[lower]) };
    }

    if (this.speller) {
      if (this.speller.correct(word)) {
        return { misspelled: false, suggestion: null };
      }
      const suggestions = this.speller.suggest(word);
      return {
        misspelled: true,
        suggestion: suggestions.length ? matchCase(word, suggestions[0]) : null,
      };
    }

    return { misspelled: false, suggestion: null };
  }

  check(text: string): CheckResult {
    const flags: Flag[] = [];
    const corrected = text.replace(/[A-Za-z][A-Za-z']*/g, (word) => {
      const { misspelled, suggestion } = this.analyze(word);
      if (misspelled) {
        flags.push({ word, suggestion });
        if (suggestion) return suggestion;
      }
      return word;
    });
    return { corrected, flags };
  }
}
