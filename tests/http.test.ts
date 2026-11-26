import { describe, expect, it } from "vitest";
import { z } from "zod";
import { badRequest, parseJson } from "@/lib/server/http";
import { AdminSubscriptionBody } from "@/lib/shared/schemas/admin";
import { GalleryBody } from "@/lib/shared/schemas/galleries";
import { DemoCreateBody, SelectionToggleBody, VerifyPasswordBody } from "@/lib/shared/schemas/public";

const request = (body: string | undefined) => new Request("http://localhost/x", { method: "POST", body });
const Schema = z.object({ a: z.string().min(1), n: z.number().optional() });

async function failure(body: string | undefined, schema: z.ZodType = Schema, message?: string) {
  const r = await parseJson(request(body), schema, { message });
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("unreachable");
  return { status: r.response.status, body: await r.response.json() };
}

describe("parseJson (S3-09)", () => {
  it("returns typed data for a valid body", async () => {
    const r = await parseJson(request('{"a":"x","n":2,"extra":1}'), Schema);
    expect(r).toEqual({ ok: true, data: { a: "x", n: 2 } });
  });

  it("never throws: missing, empty, malformed and non-JSON bodies are one 400 payload", async () => {
    for (const raw of [undefined, "", "{nope", "not json", "<html>"]) {
      expect(await failure(raw), String(raw)).toEqual({ status: 400, body: { error: "Invalid request" } });
    }
  });

  it("wrong shapes are 400 with the offending field names, never the values sent", async () => {
    const out = await failure('{"a":"","n":"secret-value"}');
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("Invalid request");
    expect(out.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(["a", "n"]);
    expect(JSON.stringify(out.body)).not.toContain("secret-value");
  });

  it("scalars, null and arrays are not objects", async () => {
    for (const raw of ["null", "5", '"text"', "[]", "[1]", "true"]) expect((await failure(raw)).status, raw).toBe(400);
  });

  it("can carry a route-specific message, and caps the number of issues", async () => {
    expect((await failure("{", Schema, "Missing uid")).body).toEqual({ error: "Missing uid" });
    const many = z.object(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, z.string()])));
    expect((await failure("{}", many)).body.issues).toHaveLength(5);
  });

  it("badRequest builds the same payload", async () => {
    expect(await badRequest().json()).toEqual({ error: "Invalid request" });
    expect(await badRequest("Nope", [{ path: "x", message: "bad" }]).json()).toEqual({ error: "Nope", issues: [{ path: "x", message: "bad" }] });
  });
});

describe("route schemas", () => {
  it("verify-password and demo: bounded strings", () => {
    expect(VerifyPasswordBody.safeParse({ slug: " abc ", password: "pw" }).data).toEqual({ slug: "abc", password: "pw" });
    for (const bad of [{}, { slug: "", password: "x" }, { slug: "a", password: "" }, { slug: "a", password: "x".repeat(201) }, { slug: 1, password: "x" }]) {
      expect(VerifyPasswordBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(DemoCreateBody.safeParse({ driveUrl: "x".repeat(501) }).success).toBe(false);
    expect(DemoCreateBody.safeParse({}).success).toBe(false);
  });

  it("selection toggle: action and item are checked", () => {
    expect(SelectionToggleBody.safeParse({ action: "add", item: { id: "f1", name: "a.jpg" } }).success).toBe(true);
    for (const bad of [{ action: "x", item: { id: "f" } }, { action: "add" }, { action: "add", item: { id: 5 } }, { action: "add", item: { id: "" } }, { action: "add", item: { id: "f", name: {} } }]) {
      expect(SelectionToggleBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("gallery body: an object whose name and driveUrl are strings; other fields pass through for the route's own helpers", () => {
    expect(GalleryBody.safeParse({ name: "G", driveUrl: "u", titleFont: 5, anything: 1 }).success).toBe(true);
    expect(GalleryBody.safeParse({}).success).toBe(true);
    for (const bad of [[], null, 5, { name: { $set: 1 } }, { name: "x".repeat(201) }, { driveUrl: 5 }]) {
      expect(GalleryBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("admin subscription: a real document id and a known action", () => {
    expect(AdminSubscriptionBody.safeParse({ uid: "u1", action: "grant_year" }).success).toBe(true);
    for (const bad of [{ uid: "a/b", action: "revoke" }, { uid: "", action: "revoke" }, { uid: 5, action: "revoke" }, { uid: "u", action: "delete_everything" }, { uid: "u", action: "assign_plan", planId: "p/q" }]) {
      expect(AdminSubscriptionBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
