/**
 * Supabase backend. Uses only the public anon key in the browser; every query is constrained
 * by the Row Level Security policies in supabase/migrations. No service-role key is ever used here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BusinessSettings, Member, Organization, Role, TableMap, TableName, User } from "../types";
import {
  BackendError, type Backend, type NewOrganizationInput, type NewRow, type RowPatch, type SettingsInput, type Workspace,
} from "./types";

interface PgError {
  code?: string;
  message: string;
  status?: number;
}

function fail(error: PgError): never {
  // Log details for developers; show users a safe generic message.
  console.error("[supabase]", error.code ?? error.status, error.message);
  if (error.code === "42501" || error.code === "PGRST301") throw new BackendError("forbidden");
  if (error.code === "PGRST116") throw new BackendError("not_found");
  if (/fetch|network/i.test(error.message)) throw new BackendError("network");
  throw new BackendError("unknown");
}

export class SupabaseBackend implements Backend {
  readonly mode = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  private async profile(id: string, email: string): Promise<User> {
    const { data } = await this.client.from("users").select("name").eq("id", id).maybeSingle();
    return { id, email, name: (data?.name as string | undefined) ?? email.split("@")[0] };
  }

  async getUser(): Promise<User | null> {
    const { data } = await this.client.auth.getSession();
    const user = data.session?.user;
    return user ? this.profile(user.id, user.email ?? "") : null;
  }

  async signUp(input: { email: string; password: string; name: string }): Promise<User> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { name: input.name } },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) throw new BackendError("email_taken");
      if (error.status === 422 || /password/i.test(error.message)) throw new BackendError("unknown", "הסיסמה אינה עומדת בדרישות");
      fail(error);
    }
    if (!data.user) throw new BackendError("unknown");
    if (!data.session) throw new BackendError("confirm_email");
    return { id: data.user.id, email: data.user.email ?? input.email, name: input.name };
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      if (/confirm/i.test(error.message)) throw new BackendError("confirm_email");
      if (error.status === 400 || /invalid/i.test(error.message)) throw new BackendError("invalid_credentials");
      fail(error);
    }
    return this.profile(data.user.id, data.user.email ?? email);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async updatePassword(current: string, next: string): Promise<void> {
    const { data } = await this.client.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new BackendError("not_authenticated");
    const check = await this.client.auth.signInWithPassword({ email, password: current });
    if (check.error) throw new BackendError("invalid_credentials", "הסיסמה הנוכחית שגויה");
    const { error } = await this.client.auth.updateUser({ password: next });
    if (error) fail(error);
  }

  async updateProfile(name: string): Promise<User> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new BackendError("not_authenticated");
    const { error } = await this.client.from("users").update({ name }).eq("id", data.user.id);
    if (error) fail(error);
    return { id: data.user.id, email: data.user.email ?? "", name };
  }

  async getWorkspace(): Promise<Workspace | null> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new BackendError("not_authenticated");
    const accept = await this.client.rpc("accept_pending_invite");
    if (accept.error) fail(accept.error);
    const { data: membership, error } = await this.client
      .from("organization_members")
      .select("role, organization_id")
      .eq("user_id", auth.user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) fail(error);
    if (!membership) return null;
    const [org, settings] = await Promise.all([
      this.client.from("organizations").select("*").eq("id", membership.organization_id).single(),
      this.client.from("business_settings").select("*").eq("organization_id", membership.organization_id).single(),
    ]);
    if (org.error) fail(org.error);
    if (settings.error) fail(settings.error);
    return { organization: org.data as Organization, settings: settings.data as BusinessSettings, role: membership.role as Role };
  }

  async createOrganization(input: NewOrganizationInput): Promise<Workspace> {
    const { error } = await this.client.rpc("create_organization", {
      p_name: input.name,
      p_business_type: input.business_type,
      p_country: input.country,
      p_currency: input.currency,
      p_language: input.language,
      p_settings: input.settings,
      p_categories: input.categories,
    });
    if (error) fail(error);
    const workspace = await this.getWorkspace();
    if (!workspace) throw new BackendError("unknown");
    return workspace;
  }

  async updateOrganization(orgId: string, patch: Partial<Omit<Organization, "id" | "created_at">>): Promise<Organization> {
    const { data, error } = await this.client.from("organizations").update(patch).eq("id", orgId).select().single();
    if (error) fail(error);
    return data as Organization;
  }

  async updateSettings(orgId: string, patch: SettingsInput): Promise<BusinessSettings> {
    const { data, error } = await this.client.from("business_settings").update(patch).eq("organization_id", orgId).select().single();
    if (error) fail(error);
    return data as BusinessSettings;
  }

  async deleteOrganization(orgId: string): Promise<void> {
    const { data, error } = await this.client.from("organizations").delete().eq("id", orgId).select("id");
    if (error) fail(error);
    if (!data?.length) throw new BackendError("forbidden");
  }

  async listMembers(orgId: string): Promise<Member[]> {
    const { data, error } = await this.client
      .from("organization_members")
      .select("id, organization_id, user_id, role, created_at, users(email, name)")
      .eq("organization_id", orgId)
      .order("created_at");
    if (error) fail(error);
    return (data ?? []).map((row) => {
      const profile = (Array.isArray(row.users) ? row.users[0] : row.users) as { email?: string; name?: string } | null;
      return {
        id: row.id, organization_id: row.organization_id, user_id: row.user_id, role: row.role as Role,
        created_at: row.created_at, email: profile?.email ?? "", name: profile?.name ?? "",
      };
    });
  }

  async updateMemberRole(memberId: string, role: Role): Promise<void> {
    const { data, error } = await this.client.from("organization_members").update({ role }).eq("id", memberId).select("id");
    if (error) fail(error);
    if (!data?.length) throw new BackendError("forbidden");
  }

  async removeMember(memberId: string): Promise<void> {
    const { data, error } = await this.client.from("organization_members").delete().eq("id", memberId).select("id");
    if (error) fail(error);
    if (!data?.length) throw new BackendError("forbidden");
  }

  async list<T extends TableName>(table: T, orgId: string): Promise<TableMap[T][]> {
    // PostgREST caps a response at 1000 rows, so page through until exhausted.
    const page = 1000;
    const rows: TableMap[T][] = [];
    for (let from = 0; ; from += page) {
      const { data, error } = await this.client
        .from(table)
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at")
        .order("id")
        .range(from, from + page - 1);
      if (error) fail(error);
      rows.push(...((data ?? []) as TableMap[T][]));
      if (!data || data.length < page) return rows;
    }
  }

  async insert<T extends TableName>(table: T, orgId: string, rows: NewRow<T>[]): Promise<TableMap[T][]> {
    if (!rows.length) return [];
    const payload = rows.map((row) => ({ ...row, organization_id: orgId }));
    const { data, error } = await this.client.from(table).insert(payload).select();
    if (error) fail(error);
    return (data ?? []) as TableMap[T][];
  }

  async update<T extends TableName>(table: T, id: string, patch: RowPatch<T>): Promise<TableMap[T]> {
    const { data, error } = await this.client.from(table as string).update(patch as Record<string, unknown>).eq("id", id).select().single();
    if (error) fail(error);
    return data as TableMap[T];
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { data, error } = await this.client.from(table).delete().in("id", ids).select("id");
    if (error) fail(error);
    if ((data?.length ?? 0) < ids.length) throw new BackendError("forbidden");
  }
}
