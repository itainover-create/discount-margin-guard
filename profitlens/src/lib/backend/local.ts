/**
 * DEMO backend. Everything lives in the browser's localStorage on this device only.
 * It enforces the same organization isolation and role matrix as the Supabase RLS policies,
 * but it is a demonstration environment: local accounts are not a security boundary.
 */
import { canDeleteBusiness, canManageBusiness, canTable, type TableAction } from "../permissions";
import type { BusinessSettings, Invite, Job, JobCostEntry, Member, Organization, Role, TableMap, TableName, User } from "../types";
import { uuid } from "../utils";
import {
  BackendError, DEFAULT_SETTINGS, type Backend, type NewOrganizationInput, type NewRow, type RowPatch,
  type SettingsInput, type Workspace,
} from "./types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LocalUser extends User {
  salt: string;
  password_hash: string;
}
interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}
type Tables = { [K in TableName]: TableMap[K][] };
interface Db extends Tables {
  version: 1;
  users: LocalUser[];
  session: string | null;
  organizations: Organization[];
  organization_members: MemberRow[];
  business_settings: BusinessSettings[];
}

const TABLES: TableName[] = [
  "customers", "employees", "service_categories", "jobs", "job_cost_entries", "activity_logs", "organization_invites",
];
export const STORAGE_KEY = "profitlens.demo.v1";

const emptyDb = (): Db => ({
  version: 1, users: [], session: null, organizations: [], organization_members: [], business_settings: [],
  customers: [], employees: [], service_categories: [], jobs: [], job_cost_entries: [], activity_logs: [],
  organization_invites: [],
});

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 100_000 },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

const now = () => new Date().toISOString();
const publicUser = ({ id, email, name }: LocalUser): User => ({ id, email, name });

export class LocalBackend implements Backend {
  readonly mode = "demo" as const;

  constructor(
    private storage: KeyValueStore,
    private key: string = STORAGE_KEY,
  ) {}

  /* ---------------------------------------------------------------- storage */

  private read(): Db {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      throw new BackendError("storage");
    }
    if (!raw) return emptyDb();
    try {
      const parsed = JSON.parse(raw) as Partial<Db>;
      return { ...emptyDb(), ...parsed };
    } catch {
      throw new BackendError("storage", "נתוני ההדגמה השמורים בדפדפן פגומים ולא ניתן לקרוא אותם.");
    }
  }

  private write(db: Db): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(db));
    } catch {
      throw new BackendError("storage");
    }
  }

  /* ---------------------------------------------------------------- guards */

  private currentUser(db: Db): LocalUser {
    const user = db.users.find((u) => u.id === db.session);
    if (!user) throw new BackendError("not_authenticated");
    return user;
  }

  /** Returns the caller's role in the organization or throws — the isolation boundary of demo mode. */
  private roleIn(db: Db, orgId: string): Role {
    const user = this.currentUser(db);
    const membership = db.organization_members.find((m) => m.organization_id === orgId && m.user_id === user.id);
    if (!membership) throw new BackendError("forbidden");
    return membership.role;
  }

  private authorize(db: Db, orgId: string, action: TableAction, table: TableName): void {
    if (!canTable(this.roleIn(db, orgId), action, table)) throw new BackendError("forbidden");
  }

  /* ---------------------------------------------------------------- auth */

  async getUser(): Promise<User | null> {
    const db = this.read();
    const user = db.users.find((u) => u.id === db.session);
    return user ? publicUser(user) : null;
  }

  async signUp(input: { email: string; password: string; name: string }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const db = this.read();
    if (db.users.some((u) => u.email === email)) throw new BackendError("email_taken");
    const salt = uuid();
    const user: LocalUser = { id: uuid(), email, name: input.name.trim(), salt, password_hash: await hashPassword(input.password, salt) };
    const fresh = this.read();
    fresh.users.push(user);
    fresh.session = user.id;
    this.write(fresh);
    return publicUser(user);
  }

  async signIn(email: string, password: string): Promise<User> {
    const db = this.read();
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || (await hashPassword(password, user.salt)) !== user.password_hash) throw new BackendError("invalid_credentials");
    const fresh = this.read();
    fresh.session = user.id;
    this.write(fresh);
    return publicUser(user);
  }

  async signOut(): Promise<void> {
    const db = this.read();
    db.session = null;
    this.write(db);
  }

  async updatePassword(current: string, next: string): Promise<void> {
    const user = this.currentUser(this.read());
    if ((await hashPassword(current, user.salt)) !== user.password_hash) {
      throw new BackendError("invalid_credentials", "הסיסמה הנוכחית שגויה");
    }
    const hash = await hashPassword(next, user.salt);
    const db = this.read();
    const stored = db.users.find((u) => u.id === user.id);
    if (!stored) throw new BackendError("not_authenticated");
    stored.password_hash = hash;
    this.write(db);
  }

  async updateProfile(name: string): Promise<User> {
    const db = this.read();
    const user = this.currentUser(db);
    user.name = name.trim();
    this.write(db);
    return publicUser(user);
  }

  /* ---------------------------------------------------------------- workspace */

  async getWorkspace(): Promise<Workspace | null> {
    const db = this.read();
    const user = this.currentUser(db);
    let membership = db.organization_members.find((m) => m.user_id === user.id);
    if (!membership) {
      const invite = db.organization_invites.find((i) => i.email === user.email);
      if (!invite) return null;
      membership = { id: uuid(), organization_id: invite.organization_id, user_id: user.id, role: invite.role, created_at: now() };
      db.organization_members.push(membership);
      db.organization_invites = db.organization_invites.filter((i) => i.id !== invite.id);
      this.write(db);
    }
    const organization = db.organizations.find((o) => o.id === membership.organization_id);
    const settings = db.business_settings.find((s) => s.organization_id === membership.organization_id);
    if (!organization || !settings) return null;
    return { organization, settings, role: membership.role };
  }

  async createOrganization(input: NewOrganizationInput): Promise<Workspace> {
    const db = this.read();
    const user = this.currentUser(db);
    if (db.organization_members.some((m) => m.user_id === user.id)) {
      throw new BackendError("forbidden", "החשבון כבר משויך לעסק");
    }
    const organization: Organization = {
      id: uuid(), name: input.name, business_type: input.business_type, country: input.country,
      currency: input.currency, language: input.language, created_at: now(),
    };
    const settings: BusinessSettings = { ...DEFAULT_SETTINGS, ...input.settings, organization_id: organization.id, updated_at: now() };
    db.organizations.push(organization);
    db.business_settings.push(settings);
    db.organization_members.push({ id: uuid(), organization_id: organization.id, user_id: user.id, role: "owner", created_at: now() });
    for (const name of input.categories) {
      db.service_categories.push({ id: uuid(), organization_id: organization.id, created_at: now(), name });
    }
    this.write(db);
    return { organization, settings, role: "owner" };
  }

  async updateOrganization(orgId: string, patch: Partial<Omit<Organization, "id" | "created_at">>): Promise<Organization> {
    const db = this.read();
    if (!canManageBusiness(this.roleIn(db, orgId))) throw new BackendError("forbidden");
    const organization = db.organizations.find((o) => o.id === orgId);
    if (!organization) throw new BackendError("not_found");
    Object.assign(organization, patch, { id: orgId });
    this.write(db);
    return organization;
  }

  async updateSettings(orgId: string, patch: SettingsInput): Promise<BusinessSettings> {
    const db = this.read();
    if (!canManageBusiness(this.roleIn(db, orgId))) throw new BackendError("forbidden");
    const settings = db.business_settings.find((s) => s.organization_id === orgId);
    if (!settings) throw new BackendError("not_found");
    Object.assign(settings, patch, { organization_id: orgId, updated_at: now() });
    this.write(db);
    return settings;
  }

  async deleteOrganization(orgId: string): Promise<void> {
    const db = this.read();
    if (!canDeleteBusiness(this.roleIn(db, orgId))) throw new BackendError("forbidden");
    db.organizations = db.organizations.filter((o) => o.id !== orgId);
    db.business_settings = db.business_settings.filter((s) => s.organization_id !== orgId);
    db.organization_members = db.organization_members.filter((m) => m.organization_id !== orgId);
    for (const table of TABLES) {
      (db[table] as { organization_id: string }[]) = (db[table] as { organization_id: string }[]).filter(
        (row) => row.organization_id !== orgId,
      );
    }
    this.write(db);
  }

  /* ---------------------------------------------------------------- members */

  async listMembers(orgId: string): Promise<Member[]> {
    const db = this.read();
    this.roleIn(db, orgId);
    return db.organization_members
      .filter((m) => m.organization_id === orgId)
      .map((m) => {
        const user = db.users.find((u) => u.id === m.user_id);
        return { ...m, email: user?.email ?? "", name: user?.name ?? "" };
      });
  }

  private manageMember(db: Db, memberId: string): MemberRow {
    const member = db.organization_members.find((m) => m.id === memberId);
    if (!member) throw new BackendError("not_found");
    if (!canManageBusiness(this.roleIn(db, member.organization_id))) throw new BackendError("forbidden");
    if (member.role === "owner") throw new BackendError("forbidden", "לא ניתן לשנות את בעל העסק");
    return member;
  }

  async updateMemberRole(memberId: string, role: Role): Promise<void> {
    const db = this.read();
    const member = this.manageMember(db, memberId);
    if (role === "owner") throw new BackendError("forbidden", "לא ניתן להעביר בעלות");
    member.role = role;
    this.write(db);
  }

  async removeMember(memberId: string): Promise<void> {
    const db = this.read();
    const member = this.manageMember(db, memberId);
    db.organization_members = db.organization_members.filter((m) => m.id !== member.id);
    this.write(db);
  }

  /* ---------------------------------------------------------------- tables */

  async list<T extends TableName>(table: T, orgId: string): Promise<TableMap[T][]> {
    const db = this.read();
    const role = this.roleIn(db, orgId);
    if (!canTable(role, "read", table)) return [];
    return (db[table] as TableMap[T][]).filter((row) => row.organization_id === orgId);
  }

  async insert<T extends TableName>(table: T, orgId: string, rows: NewRow<T>[]): Promise<TableMap[T][]> {
    const db = this.read();
    this.authorize(db, orgId, "insert", table);
    const target = db[table] as unknown as Record<string, unknown>[];
    let nextNumber =
      table === "jobs" ? Math.max(0, ...db.jobs.filter((j) => j.organization_id === orgId).map((j) => j.job_number)) + 1 : 0;
    const created = rows.map((row) => {
      const record: Record<string, unknown> = { ...row, id: uuid(), organization_id: orgId, created_at: now() };
      if (table === "jobs") {
        record.job_number = nextNumber++;
        record.updated_at = now();
      }
      if (table === "organization_invites") record.email = String(record.email).toLowerCase();
      this.checkReferences(db, orgId, table, record);
      return record;
    });
    target.push(...created);
    this.write(db);
    return created as unknown as TableMap[T][];
  }

  async update<T extends TableName>(table: T, id: string, patch: RowPatch<T>): Promise<TableMap[T]> {
    const db = this.read();
    const row = (db[table] as TableMap[T][]).find((r) => r.id === id);
    if (!row) throw new BackendError("not_found");
    this.authorize(db, row.organization_id, "update", table);
    const { id: _i, organization_id: _o, created_at: _c, job_number: _n, ...safe } = patch as Record<string, unknown>;
    void _i; void _o; void _c; void _n;
    this.checkReferences(db, row.organization_id, table, safe);
    Object.assign(row, safe);
    if (table === "jobs") (row as unknown as Job).updated_at = now();
    this.write(db);
    return row;
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    const db = this.read();
    const rows = (db[table] as { id: string; organization_id: string }[]).filter((r) => ids.includes(r.id));
    for (const row of rows) this.authorize(db, row.organization_id, "delete", table);
    const removed = new Set(rows.map((r) => r.id));
    (db[table] as { id: string }[]) = (db[table] as { id: string }[]).filter((r) => !removed.has(r.id));
    // Mirror the foreign-key behaviour of the SQL schema.
    if (table === "jobs") db.job_cost_entries = db.job_cost_entries.filter((e) => !removed.has(e.job_id));
    if (table === "customers") for (const job of db.jobs) if (job.customer_id && removed.has(job.customer_id)) job.customer_id = null;
    if (table === "service_categories") {
      for (const job of db.jobs) if (job.service_category_id && removed.has(job.service_category_id)) job.service_category_id = null;
    }
    if (table === "employees") {
      for (const entry of db.job_cost_entries) if (entry.employee_id && removed.has(entry.employee_id)) entry.employee_id = null;
    }
    this.write(db);
  }

  /** A row may only point at records of its own organization (the SQL schema enforces this with composite FKs). */
  private checkReferences(db: Db, orgId: string, table: TableName, record: Record<string, unknown>): void {
    const owned = (rows: { id: string; organization_id: string }[], id: unknown) =>
      id == null || rows.some((r) => r.id === id && r.organization_id === orgId);
    let ok = true;
    if (table === "jobs") ok = owned(db.customers, record.customer_id) && owned(db.service_categories, record.service_category_id);
    if (table === "job_cost_entries") {
      const entry = record as Partial<JobCostEntry>;
      ok = owned(db.employees, entry.employee_id) && (entry.job_id === undefined || owned(db.jobs, entry.job_id));
    }
    if (!ok) throw new BackendError("forbidden");
  }
}

export type { Invite };
