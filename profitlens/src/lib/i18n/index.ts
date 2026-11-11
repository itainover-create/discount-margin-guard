import { he, type Dictionary } from "./he";

export const dictionaries: Record<string, Dictionary> = { he };
export const DEFAULT_LOCALE = "he";

/** Shared dictionary for the active locale. Only Hebrew ships today. */
export const t: Dictionary = dictionaries[DEFAULT_LOCALE];
