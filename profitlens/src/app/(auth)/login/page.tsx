"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthFrame } from "@/components/shell/auth-frame";
import { Button, Field, Input } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useRun } from "@/lib/use-run";
import { loginSchema } from "@/lib/validation";

type Values = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { status, signIn } = useApp();
  const router = useRouter();
  const { run, busy } = useRun();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    if (status === "ready") router.replace("/dashboard");
    if (status === "no_workspace") router.replace("/onboarding");
  }, [status, router]);

  return (
    <AuthFrame title="ברוכים השבים" subtitle="התחברו כדי לראות כמה באמת מרוויחים מכל עבודה.">
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => run(() => signIn(values.email, values.password)))}>
        <Field label="אימייל" error={formState.errors.email?.message}>
          {(props) => <Input type="email" autoComplete="email" dir="ltr" className="text-start" {...props} {...register("email")} />}
        </Field>
        <Field label="סיסמה" error={formState.errors.password?.message}>
          {(props) => <Input type="password" autoComplete="current-password" dir="ltr" className="text-start" {...props} {...register("password")} />}
        </Field>
        <Button type="submit" size="lg" loading={busy || status === "loading"} className="mt-2">
          התחברות
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        עדיין אין חשבון?{" "}
        <Link href="/register" className="font-semibold text-gold-700 underline-offset-4 hover:underline">
          פתיחת חשבון
        </Link>
      </p>
    </AuthFrame>
  );
}
