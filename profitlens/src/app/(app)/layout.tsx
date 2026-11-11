import { Suspense } from "react";
import { AppShell, FullScreenLoader } from "@/components/shell/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
