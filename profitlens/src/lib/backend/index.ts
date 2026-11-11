import { LocalBackend } from "./local";
import { SupabaseBackend } from "./supabase";
import type { Backend } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when no Supabase credentials are configured and data stays in this browser only. */
export const IS_DEMO_MODE = !(url && anonKey);

let instance: Backend | null = null;

/** Browser-only singleton. */
export function getBackend(): Backend {
  if (!instance) {
    instance = url && anonKey ? new SupabaseBackend(url, anonKey) : new LocalBackend(window.localStorage);
  }
  return instance;
}

export * from "./types";
