"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formToJob, JobForm } from "@/components/jobs/job-form";
import { Card, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { useRun } from "@/lib/use-run";

export default function NewJobPage() {
  const { add, log } = useWorkspace();
  const router = useRouter();
  const { run, busy } = useRun();

  return (
    <>
      <Link href="/jobs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowRight className="size-4" />
        חזרה לעבודות
      </Link>
      <PageHeader title="עבודה חדשה" subtitle="אחרי השמירה תוכלו להוסיף הערכת עלויות ולראות את הרווח הצפוי." />
      <Card className="card-pad max-w-3xl">
        <JobForm
          job={null}
          busy={busy}
          submitLabel="יצירת העבודה"
          onCancel={() => router.push("/jobs")}
          onSubmit={(values) =>
            run(async () => {
              const [job] = await add("jobs", [{ ...formToJob(values), archived: false, is_sample: false }]);
              log("create", "job", job.id, `נוצרה העבודה ״${job.title}״`);
              router.push(`/jobs/${job.id}`);
            }, "העבודה נוצרה")
          }
        />
      </Card>
    </>
  );
}
