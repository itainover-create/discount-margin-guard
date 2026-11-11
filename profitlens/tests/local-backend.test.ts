import { beforeEach, describe, expect, it } from "vitest";
import { LocalBackend, type KeyValueStore } from "@/lib/backend/local";
import { BackendError, type NewOrganizationInput } from "@/lib/backend/types";

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("QuotaExceeded"); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const org = (name: string): NewOrganizationInput => ({ name, business_type: "hvac", country: "IL", currency: "ILS", language: "he", settings: {}, categories: ["התקנה"] });
const job = (title: string) => ({
  title, customer_id: null, service_category_id: null, description: null, status: "draft" as const, planned_date: null, completed_date: null,
  quoted_price: 150000, final_price: null, vat_mode: "added" as const, vat_rate_bp: 1800, payment_fee_bp: 0, notes: null, archived: false, is_sample: false,
});
const cost = (job_id: string) => ({
  job_id, kind: "actual" as const, category: "other" as const, description: "x", quantity: null, unit: null, unit_cost: null, employee_id: null, hours: null,
  hourly_cost: null, distance_km: null, rate_per_km: null, parking: null, other_travel: null, amount: 1000, entry_date: "2026-01-01",
});
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof BackendError ? e.code : "other"));

let store: MemoryStore;
let db: LocalBackend;
beforeEach(() => { store = new MemoryStore(); db = new LocalBackend(store); });

describe("authentication (demo backend)", () => {
  it("registers, signs in and rejects bad credentials", async () => {
    const user = await db.signUp({ email: "A@Example.com", password: "secret-123", name: "A" });
    expect(user.email).toBe("a@example.com");
    expect(await code(db.signUp({ email: "a@example.com", password: "x", name: "dup" }))).toBe("email_taken");
    await db.signOut();
    expect(await db.getUser()).toBeNull();
    expect(await code(db.signIn("a@example.com", "wrong"))).toBe("invalid_credentials");
    expect(await code(db.signIn("nobody@example.com", "secret-123"))).toBe("invalid_credentials");
    expect((await db.signIn("a@example.com", "secret-123")).id).toBe(user.id);
  });
  it("never stores the password in clear text", async () => {
    await db.signUp({ email: "a@example.com", password: "secret-123", name: "A" });
    expect([...store.data.values()].join("")).not.toContain("secret-123");
  });
  it("changes the password only with the current one", async () => {
    await db.signUp({ email: "a@example.com", password: "secret-123", name: "A" });
    expect(await code(db.updatePassword("bad", "new-secret-1"))).toBe("invalid_credentials");
    await db.updatePassword("secret-123", "new-secret-1");
    await db.signOut();
    expect(await code(db.signIn("a@example.com", "secret-123"))).toBe("invalid_credentials");
    await db.signIn("a@example.com", "new-secret-1");
  });
  it("requires a session", async () => {
    expect(await code(db.getWorkspace())).toBe("not_authenticated");
    expect(await code(db.list("jobs", "any"))).toBe("not_authenticated");
  });
});

describe("Test 8 — organization-level access restrictions", () => {
  async function twoOrgs() {
    await db.signUp({ email: "alice@a.test", password: "password-a", name: "Alice" });
    const a = await db.createOrganization(org("A"));
    const [jobA] = await db.insert("jobs", a.organization.id, [job("A1")]);
    const [custA] = await db.insert("customers", a.organization.id, [{ name: "CA", business_name: null, phone: null, email: null, notes: null, is_sample: false }]);
    await db.insert("job_cost_entries", a.organization.id, [cost(jobA.id)]);
    await db.signOut();
    await db.signUp({ email: "bob@b.test", password: "password-b", name: "Bob" });
    const b = await db.createOrganization(org("B"));
    const [jobB] = await db.insert("jobs", b.organization.id, [job("B1")]);
    return { a: a.organization.id, b: b.organization.id, jobA, jobB, custA };
  }

  it("a user cannot read another organization's records", async () => {
    const { a, b } = await twoOrgs(); // signed in as Bob
    expect(await code(db.list("jobs", a))).toBe("forbidden");
    expect(await code(db.list("customers", a))).toBe("forbidden");
    expect(await code(db.list("job_cost_entries", a))).toBe("forbidden");
    expect(await code(db.listMembers(a))).toBe("forbidden");
    expect((await db.list("jobs", b)).map((j) => j.title)).toEqual(["B1"]);
    expect((await db.getWorkspace())?.organization.name).toBe("B");
  });
  it("a user cannot write to another organization", async () => {
    const { a, b, jobA, jobB, custA } = await twoOrgs();
    expect(await code(db.insert("jobs", a, [job("intruder")]))).toBe("forbidden");
    expect(await code(db.update("jobs", jobA.id, { title: "hacked" }))).toBe("forbidden");
    expect(await code(db.remove("jobs", [jobA.id]))).toBe("forbidden");
    expect(await code(db.updateSettings(a, { vat_rate_bp: 0 }))).toBe("forbidden");
    expect(await code(db.updateOrganization(a, { name: "x" }))).toBe("forbidden");
    expect(await code(db.deleteOrganization(a))).toBe("forbidden");
    // cross-organization references are rejected as well
    expect(await code(db.insert("job_cost_entries", b, [cost(jobA.id)]))).toBe("forbidden");
    expect(await code(db.update("jobs", jobB.id, { customer_id: custA.id }))).toBe("forbidden");
    await db.signOut();
    await db.signIn("alice@a.test", "password-a");
    expect((await db.list("jobs", a)).map((j) => j.title)).toEqual(["A1"]);
  });
  it("job numbers are sequential per organization", async () => {
    const { a, b, jobA, jobB } = await twoOrgs();
    expect([jobA.job_number, jobB.job_number]).toEqual([1, 1]);
    const [second] = await db.insert("jobs", b, [job("B2")]);
    expect(second.job_number).toBe(2);
    expect(a).not.toBe(b);
  });
  it("deleting a business removes only its own data", async () => {
    const { a, b } = await twoOrgs();
    await db.deleteOrganization(b);
    expect(await db.getWorkspace()).toBeNull();
    await db.signOut();
    await db.signIn("alice@a.test", "password-a");
    expect(await db.list("jobs", a)).toHaveLength(1);
  });
});

describe("roles", () => {
  it("an invited team member gets limited permissions", async () => {
    await db.signUp({ email: "owner@a.test", password: "password-a", name: "Owner" });
    const ws = await db.createOrganization(org("A"));
    const id = ws.organization.id;
    const [j] = await db.insert("jobs", id, [job("A1")]);
    const [emp] = await db.insert("employees", id, [{ name: "E", role: "member", hourly_cost: 8000, active: true, is_sample: false }]);
    await db.insert("organization_invites", id, [{ email: "Member@A.test", role: "member" }]);
    await db.signOut();
    await db.signUp({ email: "member@a.test", password: "password-m", name: "Member" });
    const joined = await db.getWorkspace();
    expect(joined?.role).toBe("member");
    expect(await db.list("jobs", id)).toHaveLength(1);
    await db.update("jobs", j.id, { notes: "on site" });
    const [entry] = await db.insert("job_cost_entries", id, [cost(j.id)]);
    await db.remove("job_cost_entries", [entry.id]);
    expect(await code(db.remove("jobs", [j.id]))).toBe("forbidden");
    expect(await code(db.update("employees", emp.id, { hourly_cost: 1 }))).toBe("forbidden");
    expect(await code(db.updateSettings(id, { vat_rate_bp: 0 }))).toBe("forbidden");
    expect(await code(db.deleteOrganization(id))).toBe("forbidden");
    expect(await code(db.insert("organization_invites", id, [{ email: "x@x.test", role: "admin" }]))).toBe("forbidden");
    expect(await db.list("organization_invites", id)).toEqual([]);
    const me = (await db.listMembers(id)).find((m) => m.email === "member@a.test")!;
    expect(await code(db.updateMemberRole(me.id, "admin"))).toBe("forbidden");
    const owner = (await db.listMembers(id)).find((m) => m.role === "owner")!;
    await db.signOut();
    await db.signIn("owner@a.test", "password-a");
    expect(await code(db.updateMemberRole(owner.id, "member"))).toBe("forbidden");
    await db.updateMemberRole(me.id, "admin");
    expect(await code(db.updateMemberRole(me.id, "owner"))).toBe("forbidden");
  });
});

describe("referential behaviour and failures", () => {
  it("cascades like the SQL schema", async () => {
    await db.signUp({ email: "a@a.test", password: "password-a", name: "A" });
    const id = (await db.createOrganization(org("A"))).organization.id;
    const [c] = await db.insert("customers", id, [{ name: "C", business_name: null, phone: null, email: null, notes: null, is_sample: false }]);
    const [j] = await db.insert("jobs", id, [{ ...job("J"), customer_id: c.id }]);
    await db.insert("job_cost_entries", id, [cost(j.id)]);
    await db.remove("customers", [c.id]);
    expect((await db.list("jobs", id))[0].customer_id).toBeNull();
    await db.remove("jobs", [j.id]);
    expect(await db.list("job_cost_entries", id)).toEqual([]);
  });
  it("surfaces storage failures as a safe error instead of losing data silently", async () => {
    await db.signUp({ email: "a@a.test", password: "password-a", name: "A" });
    const id = (await db.createOrganization(org("A"))).organization.id;
    store.failWrites = true;
    expect(await code(db.insert("jobs", id, [job("J")]))).toBe("storage");
    store.failWrites = false;
    expect(await db.list("jobs", id)).toEqual([]);
    store.data.set("profitlens.demo.v1", "{corrupt");
    expect(await code(db.getUser())).toBe("storage");
  });
  it("missing rows report not_found", async () => {
    await db.signUp({ email: "a@a.test", password: "password-a", name: "A" });
    await db.createOrganization(org("A"));
    expect(await code(db.update("jobs", "nope", { title: "x" }))).toBe("not_found");
  });
});
