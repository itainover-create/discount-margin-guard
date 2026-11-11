"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui";
import type { NewRow } from "@/lib/backend/types";
import { useWorkspace } from "@/lib/store";
import { useRun } from "@/lib/use-run";
import type { Job } from "@/lib/types";

/** Duplicate / archive / delete — shared by the jobs list and the job page. */
export function useJobActions() {
  const { add, patch, removeRows, data, log } = useWorkspace();
  const confirm = useConfirm();
  const router = useRouter();
  const { run, busy } = useRun();

  return {
    busy,
    /** Copies the job as a new draft with its ESTIMATED costs only; actuals belong to the original job. */
    duplicate: (job: Job) =>
      run(async () => {
        const { id: _id, organization_id: _org, created_at: _c, updated_at: _u, job_number: _n, ...rest } = job;
        void _id; void _org; void _c; void _u; void _n;
        const [copy] = await add("jobs", [
          { ...rest, title: `${job.title} (העתק)`, status: "draft", planned_date: null, completed_date: null, final_price: null, archived: false, is_sample: false },
        ]);
        const estimates: NewRow<"job_cost_entries">[] = data.job_cost_entries
          .filter((e) => e.job_id === job.id && e.kind === "estimated")
          .map(({ id: _i, organization_id: _o, created_at: _t, ...entry }) => {
            void _i; void _o; void _t;
            return { ...entry, job_id: copy.id };
          });
        if (estimates.length) await add("job_cost_entries", estimates);
        log("duplicate", "job", copy.id, `שוכפלה העבודה ״${job.title}״`);
        router.push(`/jobs/${copy.id}`);
      }, "העבודה שוכפלה כטיוטה חדשה"),
    setArchived: (job: Job, archived: boolean) =>
      run(async () => {
        await patch("jobs", job.id, { archived });
        log(archived ? "archive" : "unarchive", "job", job.id, job.title);
      }, archived ? "העבודה הועברה לארכיון" : "העבודה שוחזרה מהארכיון"),
    remove: async (job: Job, after?: () => void) => {
      const ok = await confirm({
        title: "מחיקת עבודה",
        text: `העבודה ״${job.title}״ וכל שורות העלות שלה יימחקו לצמיתות. אם רוצים רק להסתיר אותה — אפשר להעביר לארכיון.`,
        confirmLabel: "מחיקה לצמיתות",
        danger: true,
      });
      if (!ok) return;
      await run(async () => {
        await removeRows("jobs", [job.id]);
        log("delete", "job", job.id, `נמחקה העבודה ״${job.title}״`);
        after?.();
      }, "העבודה נמחקה");
    },
  };
}
