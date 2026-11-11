"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui";
import { BackendError } from "./backend/types";

/**
 * Wraps an async user action: tracks a busy flag, shows a success toast, and turns any
 * failure into a safe, readable message instead of an unhandled rejection.
 */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await action();
        if (success) toast(success);
        return result;
      } catch (error) {
        if (!(error instanceof BackendError)) console.error(error);
        toast(error instanceof BackendError ? error.message : "אירעה שגיאה לא צפויה. נסו שוב.", "negative");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}
