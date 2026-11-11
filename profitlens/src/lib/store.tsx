"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getBackend, IS_DEMO_MODE, BackendError, type NewOrganizationInput, type NewRow, type RowPatch, type SettingsInput, type Workspace } from "./backend";
import { buildJobRows, type JobRow } from "./reports";
import { buildSampleData } from "./seed";
import type {
  ActivityLog, BusinessSettings, Customer, Employee, Invite, Job, JobCostEntry, Member, Organization, Role, ServiceCategory, TableMap, TableName, User,
} from "./types";

export interface AppData {
  customers: Customer[];
  employees: Employee[];
  service_categories: ServiceCategory[];
  jobs: Job[];
  job_cost_entries: JobCostEntry[];
  activity_logs: ActivityLog[];
  organization_invites: Invite[];
  members: Member[];
}

const EMPTY: AppData = {
  customers: [], employees: [], service_categories: [], jobs: [], job_cost_entries: [], activity_logs: [],
  organization_invites: [], members: [],
};

export type AppStatus = "loading" | "signed_out" | "no_workspace" | "ready" | "error";

interface AppContextValue {
  status: AppStatus;
  error: string | null;
  isDemo: boolean;
  user: User | null;
  organization: Organization | null;
  settings: BusinessSettings | null;
  role: Role | null;
  data: AppData;
  jobRows: JobRow[];
  hasSampleData: boolean;
  reload(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { email: string; password: string; name: string }): Promise<void>;
  signOut(): Promise<void>;
  updateProfile(name: string): Promise<void>;
  updatePassword(current: string, next: string): Promise<void>;
  createOrganization(input: NewOrganizationInput, withSampleData: boolean): Promise<void>;
  updateOrganization(patch: Partial<Omit<Organization, "id" | "created_at">>): Promise<void>;
  updateSettings(patch: SettingsInput): Promise<void>;
  deleteBusiness(): Promise<void>;
  add<T extends TableName>(table: T, rows: NewRow<T>[]): Promise<TableMap[T][]>;
  patch<T extends TableName>(table: T, id: string, patch: RowPatch<T>): Promise<TableMap[T]>;
  removeRows(table: TableName, ids: string[]): Promise<void>;
  updateMemberRole(memberId: string, role: Role): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  loadSampleData(): Promise<void>;
  removeSampleData(): Promise<void>;
  log(action: string, entity: string, entityId: string | null, summary: string): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

/** Narrowed accessor for screens that only render once a workspace is loaded. */
export function useWorkspace() {
  const app = useApp();
  if (!app.user || !app.organization || !app.settings || !app.role) throw new Error("Workspace is not loaded");
  return { ...app, user: app.user, organization: app.organization, settings: app.settings, role: app.role };
}

const DATA_TABLES: TableName[] = [
  "customers", "employees", "service_categories", "jobs", "job_cost_entries", "activity_logs", "organization_invites",
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const orgId = workspace?.organization.id ?? null;
  const orgRef = useRef<string | null>(null);
  orgRef.current = orgId;

  const loadData = useCallback(async (organizationId: string): Promise<AppData> => {
    const backend = getBackend();
    const [customers, employees, service_categories, jobs, job_cost_entries, activity_logs, organization_invites, members] =
      await Promise.all([
        backend.list("customers", organizationId),
        backend.list("employees", organizationId),
        backend.list("service_categories", organizationId),
        backend.list("jobs", organizationId),
        backend.list("job_cost_entries", organizationId),
        backend.list("activity_logs", organizationId),
        backend.list("organization_invites", organizationId),
        backend.listMembers(organizationId),
      ]);
    return { customers, employees, service_categories, jobs, job_cost_entries, activity_logs, organization_invites, members };
  }, []);

  const reload = useCallback(async () => {
    try {
      const backend = getBackend();
      const current = await backend.getUser();
      if (!current) {
        setUser(null);
        setWorkspace(null);
        setData(EMPTY);
        setStatus("signed_out");
        return;
      }
      setUser(current);
      const ws = await backend.getWorkspace();
      if (!ws) {
        setWorkspace(null);
        setData(EMPTY);
        setStatus("no_workspace");
        return;
      }
      const loaded = await loadData(ws.organization.id);
      setWorkspace(ws);
      setData(loaded);
      setError(null);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof BackendError ? cause.message : "טעינת הנתונים נכשלה");
      setStatus("error");
    }
  }, [loadData]);

  useEffect(() => {
    // Initial session restore: reads the persisted session from the backend once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const requireOrg = () => {
    if (!orgRef.current) throw new BackendError("not_authenticated");
    return orgRef.current;
  };

  const add = useCallback(async <T extends TableName>(table: T, rows: NewRow<T>[]) => {
    const created = await getBackend().insert(table, requireOrg(), rows);
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as TableMap[T][]), ...created] }));
    return created;
  }, []);

  const patch = useCallback(async <T extends TableName>(table: T, id: string, changes: RowPatch<T>) => {
    const updated = await getBackend().update(table, id, changes);
    setData((prev) => ({ ...prev, [table]: (prev[table] as TableMap[T][]).map((row) => (row.id === id ? updated : row)) }));
    return updated;
  }, []);

  const removeRows = useCallback(async (table: TableName, ids: string[]) => {
    if (!ids.length) return;
    await getBackend().remove(table, ids);
    const gone = new Set(ids);
    setData((prev) => {
      const next = { ...prev, [table]: (prev[table] as { id: string }[]).filter((row) => !gone.has(row.id)) } as AppData;
      // Mirror the database's foreign-key behaviour in memory.
      if (table === "jobs") next.job_cost_entries = next.job_cost_entries.filter((e) => !gone.has(e.job_id));
      if (table === "customers") next.jobs = next.jobs.map((j) => (j.customer_id && gone.has(j.customer_id) ? { ...j, customer_id: null } : j));
      if (table === "service_categories") {
        next.jobs = next.jobs.map((j) => (j.service_category_id && gone.has(j.service_category_id) ? { ...j, service_category_id: null } : j));
      }
      if (table === "employees") {
        next.job_cost_entries = next.job_cost_entries.map((e) => (e.employee_id && gone.has(e.employee_id) ? { ...e, employee_id: null } : e));
      }
      return next;
    });
  }, []);

  const log = useCallback(
    (action: string, entity: string, entityId: string | null, summary: string) => {
      if (!orgRef.current || !user) return;
      // Activity logging is best-effort and must never block or fail a user action.
      getBackend()
        .insert("activity_logs", orgRef.current, [{ user_id: user.id, action, entity, entity_id: entityId, summary }])
        .then((created) => setData((prev) => ({ ...prev, activity_logs: [...prev.activity_logs, ...created] })))
        .catch(() => undefined);
    },
    [user],
  );

  const loadSampleFor = useCallback(async (organizationId: string, settings: BusinessSettings) => {
    const backend = getBackend();
    const sample = buildSampleData(settings);
    const existing = await backend.list("service_categories", organizationId);
    const missing = sample.categories.filter((name) => !existing.some((c) => c.name === name));
    const createdCategories = await backend.insert("service_categories", organizationId, missing.map((name) => ({ name })));
    const categories = [...existing, ...createdCategories];
    const customers = await backend.insert("customers", organizationId, sample.customers);
    const employees = await backend.insert("employees", organizationId, sample.employees);
    const jobs = await backend.insert(
      "jobs",
      organizationId,
      sample.jobs.map((item) => ({
        ...item.job,
        customer_id: customers[item.customer]?.id ?? null,
        service_category_id: categories.find((c) => c.name === item.category)?.id ?? null,
      })),
    );
    await backend.insert(
      "job_cost_entries",
      organizationId,
      sample.jobs.flatMap((item, index) =>
        item.entries.map(({ employeeIndex, ...entry }) => ({
          ...entry,
          job_id: jobs[index].id,
          employee_id: employeeIndex == null ? null : (employees[employeeIndex]?.id ?? null),
        })),
      ),
    );
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const backend = () => getBackend();
    const settings = workspace?.settings ?? null;
    return {
      status,
      error,
      isDemo: IS_DEMO_MODE,
      user,
      organization: workspace?.organization ?? null,
      settings,
      role: workspace?.role ?? null,
      data,
      jobRows: [],
      hasSampleData: data.jobs.some((j) => j.is_sample) || data.customers.some((c) => c.is_sample) || data.employees.some((e) => e.is_sample),
      reload,
      async signIn(email, password) {
        await backend().signIn(email, password);
        await reload();
      },
      async signUp(input) {
        await backend().signUp(input);
        await reload();
      },
      async signOut() {
        await backend().signOut();
        setUser(null);
        setWorkspace(null);
        setData(EMPTY);
        setStatus("signed_out");
      },
      async updateProfile(name) {
        setUser(await backend().updateProfile(name));
        if (orgRef.current) {
          const members = await backend().listMembers(orgRef.current);
          setData((prev) => ({ ...prev, members }));
        }
      },
      updatePassword: (current, next) => backend().updatePassword(current, next),
      async createOrganization(input, withSampleData) {
        const ws = await backend().createOrganization(input);
        if (withSampleData) await loadSampleFor(ws.organization.id, ws.settings);
        await reload();
      },
      async updateOrganization(changes) {
        const organization = await backend().updateOrganization(requireOrg(), changes);
        setWorkspace((prev) => (prev ? { ...prev, organization } : prev));
      },
      async updateSettings(changes) {
        const next = await backend().updateSettings(requireOrg(), changes);
        setWorkspace((prev) => (prev ? { ...prev, settings: next } : prev));
      },
      async deleteBusiness() {
        await backend().deleteOrganization(requireOrg());
        await reload();
      },
      add,
      patch,
      removeRows,
      async updateMemberRole(memberId, role) {
        await backend().updateMemberRole(memberId, role);
        setData((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }));
      },
      async removeMember(memberId) {
        await backend().removeMember(memberId);
        setData((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== memberId) }));
      },
      async loadSampleData() {
        if (!settings) return;
        const organizationId = requireOrg();
        await loadSampleFor(organizationId, settings);
        setData(await loadData(organizationId));
      },
      async removeSampleData() {
        const organizationId = requireOrg();
        const b = backend();
        await b.remove("jobs", data.jobs.filter((j) => j.is_sample).map((j) => j.id));
        await b.remove("customers", data.customers.filter((c) => c.is_sample).map((c) => c.id));
        await b.remove("employees", data.employees.filter((e) => e.is_sample).map((e) => e.id));
        setData(await loadData(organizationId));
      },
      log,
    };
  }, [status, error, user, workspace, data, reload, add, patch, removeRows, log, loadData, loadSampleFor]);

  const jobRows = useMemo(
    () =>
      workspace
        ? buildJobRows(
            { jobs: data.jobs, entries: data.job_cost_entries, customers: data.customers, categories: data.service_categories },
            workspace.settings,
          )
        : [],
    [data.jobs, data.job_cost_entries, data.customers, data.service_categories, workspace],
  );

  const full = useMemo(() => ({ ...value, jobRows }), [value, jobRows]);
  return <AppContext.Provider value={full}>{children}</AppContext.Provider>;
}

export { DATA_TABLES };
