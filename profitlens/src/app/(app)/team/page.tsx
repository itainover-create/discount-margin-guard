"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailPlus, Pencil, Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Money, SampleBadge } from "@/components/finance-ui";
import { Badge, Button, Card, CardHeader, Dialog, DialogFooter, EmptyState, Field, Input, Notice, PageHeader, Select, UnitInput, useConfirm } from "@/components/ui";
import { minorToDecimalString, toMinor } from "@/lib/finance/money";
import { t } from "@/lib/i18n";
import { canManageBusiness } from "@/lib/permissions";
import { useWorkspace } from "@/lib/store";
import type { Employee, Role } from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { employeeSchema, inviteSchema, type EmployeeFormValues } from "@/lib/validation";

const toForm = (e: Employee | null, hourly: number): EmployeeFormValues => ({
  name: e?.name ?? "", role: e?.role ?? "member", hourly_cost: e ? minorToDecimalString(e.hourly_cost) : hourly > 0 ? minorToDecimalString(hourly) : "", active: e?.active ?? true,
});

function EmployeeDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { add, patch, settings } = useWorkspace();
  const { run, busy } = useRun();
  const { register, handleSubmit, reset, formState } = useForm<EmployeeFormValues>({ resolver: zodResolver(employeeSchema), defaultValues: toForm(employee, settings.default_hourly_cost) });
  useEffect(() => reset(toForm(employee, settings.default_hourly_cost)), [employee, settings.default_hourly_cost, reset]);
  const errors = formState.errors;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={employee ? "עריכת איש/אשת צוות" : "הוספה לצוות"} size="sm">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((v) =>
          run(async () => {
            const row = { name: v.name, role: v.role, hourly_cost: toMinor(v.hourly_cost) ?? 0, active: v.active };
            if (employee) await patch("employees", employee.id, row);
            else await add("employees", [{ ...row, is_sample: false }]);
            onClose();
          }, t.common.saved),
        )}
      >
        <Field label="שם" error={errors.name?.message}>{(p) => <Input {...p} {...register("name")} />}</Field>
        <Field label="תפקיד">
          {(p) => (
            <Select {...p} {...register("role")}>
              {(["owner", "admin", "member"] as Role[]).map((r) => <option key={r} value={r}>{t.role[r]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="עלות פנימית לשעה" error={errors.hourly_cost?.message} hint="מה עולה לעסק שעת עבודה של האדם הזה. משמש לחישוב עלות העבודה — לא לחישוב שכר.">
          {(p) => <UnitInput unit="₪" placeholder="0.00" {...p} {...register("hourly_cost")} />}
        </Field>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-gold-600)]" {...register("active")} />
          פעיל/ה (מופיע/ה ברשימת העובדים בעת רישום שעות)
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" loading={busy}>{t.common.save}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

type InviteValues = z.infer<typeof inviteSchema>;

export default function TeamPage() {
  const { data, role, user, isDemo, add, removeRows, updateMemberRole, removeMember } = useWorkspace();
  const confirm = useConfirm();
  const { run, busy } = useRun();
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);
  const manage = canManageBusiness(role);
  const invite = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "member" } });

  return (
    <>
      <PageHeader
        title={t.nav.team}
        subtitle="אנשי הצוות ועלות שעת העבודה שלהם, והרשאות הגישה למערכת. ProfitLens אינו מערכת שכר."
        actions={manage && <Button onClick={() => setEditing(null)}><Plus className="size-4" />הוספה לצוות</Button>}
      />

      <Card>
        <CardHeader title="אנשי צוות ועלות שעה" subtitle="העלות הפנימית לשעה משמשת לחישוב עלות העבודה בכל משימה" />
        {data.employees.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-6" />}
            title="עדיין אין אנשי צוות"
            text="הוסיפו את עצמכם ואת העובדים, כל אחד עם עלות השעה שלו, כדי שעלות העבודה תחושב נכון."
            action={manage && <Button onClick={() => setEditing(null)}><Plus className="size-4" />הוספה לצוות</Button>}
          />
        ) : (
          <div className="table-wrap mt-4">
            <table className="table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>תפקיד</th>
                  <th className="end">עלות פנימית לשעה</th>
                  <th>סטטוס</th>
                  {manage && <th className="end"><span className="sr-only">{t.common.actions}</span></th>}
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium">
                      <span className="flex items-center gap-2">{e.name}{e.is_sample && <SampleBadge />}</span>
                    </td>
                    <td className="text-ink-2">{t.role[e.role]}</td>
                    <td className="end"><Money value={e.hourly_cost} /></td>
                    <td><Badge tone={e.active ? "positive" : "neutral"}>{e.active ? "פעיל/ה" : "לא פעיל/ה"}</Badge></td>
                    {manage && (
                      <td className="end">
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="sm" icon aria-label={`עריכת ${e.name}`} onClick={() => setEditing(e)}><Pencil className="size-4" /></Button>
                          <Button
                            variant="ghost" size="sm" icon className="hover:text-negative" aria-label={`מחיקת ${e.name}`}
                            onClick={async () => {
                              if (await confirm({ title: "מחיקה מהצוות", text: `״${e.name}״ יימחק/תימחק. שורות העבודה שכבר נרשמו יישארו עם הסכומים שלהן, ללא שיוך לעובד/ת. כדי לשמור על השיוך — אפשר לסמן כ״לא פעיל/ה״ במקום למחוק.`, confirmLabel: t.common.delete, danger: true })) {
                                await run(() => removeRows("employees", [e.id]), "נמחק/ה מהצוות");
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="גישה למערכת" subtitle="מי יכול להתחבר לעסק הזה ומה מותר לו" />
        <div className="card-pad pt-4">
          <div className="mb-4 grid gap-2 text-[13px] leading-relaxed text-ink-2 sm:grid-cols-3">
            {[
              [t.role.owner, "גישה מלאה, כולל מחיקת העסק."],
              [t.role.admin, "ניהול מלא של עבודות, לקוחות, צוות והגדרות."],
              [t.role.member, "צפייה, יצירה ועדכון של עבודות, לקוחות ועלויות. ללא מחיקות, הגדרות או ניהול צוות."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-line bg-ivory/50 p-3">
                <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-ink"><ShieldCheck className="size-3.5 text-gold-600" />{title}</div>
                {text}
              </div>
            ))}
          </div>

          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.name || m.email}{m.user_id === user.id && <span className="text-muted"> (את/ה)</span>}</div>
                  <div className="num text-xs text-muted">{m.email}</div>
                </div>
                {manage && m.role !== "owner" && m.user_id !== user.id ? (
                  <div className="flex items-center gap-2">
                    <Select aria-label={`תפקיד של ${m.name || m.email}`} className="h-8 w-auto text-[13px]" value={m.role} onChange={(e) => run(() => updateMemberRole(m.id, e.target.value as Role), "התפקיד עודכן")}>
                      <option value="admin">{t.role.admin}</option>
                      <option value="member">{t.role.member}</option>
                    </Select>
                    <Button
                      variant="ghost" size="sm" icon className="hover:text-negative" aria-label={`הסרת הגישה של ${m.name || m.email}`}
                      onClick={async () => {
                        if (await confirm({ title: "הסרת גישה", text: `${m.name || m.email} לא יוכל/תוכל עוד לגשת לנתוני העסק.`, confirmLabel: "הסרת גישה", danger: true })) await run(() => removeMember(m.id), "הגישה הוסרה");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Badge tone={m.role === "owner" ? "gold" : "neutral"}>{t.role[m.role]}</Badge>
                )}
              </li>
            ))}
            {data.organization_invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                <div>
                  <div className="num text-sm font-medium">{i.email}</div>
                  <div className="text-xs text-muted">הזמנה ממתינה · {t.role[i.role]}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => run(() => removeRows("organization_invites", [i.id]), "ההזמנה בוטלה")}>ביטול ההזמנה</Button>
              </li>
            ))}
          </ul>

          {manage ? (
            <form
              noValidate
              className="mt-4 flex flex-wrap items-start gap-2"
              onSubmit={invite.handleSubmit((v) =>
                run(async () => {
                  if (data.members.some((m) => m.email === v.email) || data.organization_invites.some((i) => i.email === v.email)) {
                    invite.setError("email", { message: "הכתובת כבר בצוות או שכבר הוזמנה" });
                    return;
                  }
                  await add("organization_invites", [{ email: v.email, role: v.role }]);
                  invite.reset();
                }, undefined),
              )}
            >
              <Field label="הזמנה לפי אימייל" error={invite.formState.errors.email?.message} className="min-w-52 flex-1">
                {(p) => <Input type="email" dir="ltr" className="text-start" placeholder="name@example.com" {...p} {...invite.register("email")} />}
              </Field>
              <Field label="תפקיד">
                {(p) => (
                  <Select {...p} {...invite.register("role")}>
                    <option value="member">{t.role.member}</option>
                    <option value="admin">{t.role.admin}</option>
                  </Select>
                )}
              </Field>
              <Button type="submit" variant="outline" loading={busy} className="mt-[26px]"><MailPlus className="size-4" />הוספת הזמנה</Button>
            </form>
          ) : (
            <Notice tone="info" className="mt-4">רק בעלים ומנהלים יכולים לנהל את הצוות וההרשאות.</Notice>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {isDemo
              ? "בסביבת ההדגמה לא נשלח אימייל: מי שנרשם בדפדפן הזה עם הכתובת שהוזמנה מצטרף אוטומטית לעסק."
              : "ProfitLens אינו שולח את ההזמנה באימייל. יש להודיע לאדם להירשם עם הכתובת הזו — לאחר אימות האימייל הוא יצורף אוטומטית לעסק."}
          </p>
        </div>
      </Card>

      {editing !== undefined && <EmployeeDialog employee={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
