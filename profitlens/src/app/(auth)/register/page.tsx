"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthFrame } from "@/components/shell/auth-frame";
import { Button, Field, Input } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { useRun } from "@/lib/use-run";
import { registerSchema } from "@/lib/validation";

type Values = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { status, signUp } = useApp();
  const router = useRouter();
  const { run, busy } = useRun();
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });
  const errors = formState.errors;

  useEffect(() => {
    if (status === "ready") router.replace("/dashboard");
    if (status === "no_workspace") router.replace("/onboarding");
  }, [status, router]);

  return (
    <AuthFrame title="פתיחת חשבון" subtitle="שתי דקות של הגדרה — ואפשר לתמחר את העבודה הבאה בביטחון.">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => run(() => signUp({ name: values.name, email: values.email, password: values.password })))}
      >
        <Field label="שם מלא" error={errors.name?.message}>
          {(props) => <Input autoComplete="name" {...props} {...register("name")} />}
        </Field>
        <Field label="אימייל" error={errors.email?.message}>
          {(props) => <Input type="email" autoComplete="email" dir="ltr" className="text-start" {...props} {...register("email")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="סיסמה" error={errors.password?.message} hint="8 תווים לפחות">
            {(props) => <Input type="password" autoComplete="new-password" dir="ltr" className="text-start" {...props} {...register("password")} />}
          </Field>
          <Field label="אימות סיסמה" error={errors.confirm?.message}>
            {(props) => <Input type="password" autoComplete="new-password" dir="ltr" className="text-start" {...props} {...register("confirm")} />}
          </Field>
        </div>
        <Button type="submit" size="lg" loading={busy} className="mt-2">
          יצירת חשבון
        </Button>
        <p className="text-xs leading-relaxed text-muted">{t.disclaimer}</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        כבר יש חשבון?{" "}
        <Link href="/login" className="font-semibold text-gold-700 underline-offset-4 hover:underline">
          התחברות
        </Link>
      </p>
    </AuthFrame>
  );
}
