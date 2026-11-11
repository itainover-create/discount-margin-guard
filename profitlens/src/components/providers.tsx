"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/lib/store";
import { UiProvider } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <UiProvider>
      <AppProvider>{children}</AppProvider>
    </UiProvider>
  );
}
