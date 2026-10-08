import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { MEDIA_TYPES, TEMPLATE_SLOT_ASSIGNABLE_MEDIA_TYPES } from "../../../domain";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import type { TemplateEditorManifestV1 } from "../../../../templates/core/editor-manifest";
import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { validateFinalizeMediaInput } from "../../media/validate-finalize-media-input";
import { validateUploadIntentInput } from "../../media/validate-upload-intent-input";
import { supabaseTemplateMediaSlotGateway } from "../../supabase/template-media-slot-repository";
import { listTemplateMediaSlots } from "../list-template-media-slots";
import {
  setTemplateMediaSlot,
  validateSetTemplateMediaSlotInput,
  type SetTemplateMediaSlotDependencies,
} from "../set-template-media-slot";
import type { TemplateMediaSlotGateway } from "../template-media-slot-gateway";
import { TEMPLATE_MEDIA_SLOT_RPC_ERROR_CODES } from "../template-media-slot-rpc-error-codes";
import type { ReplaceTemplateMediaSlotCommand, TemplateMediaSlotItem } from "../template-media-slot-types";

/** TE-03B — PHOTO library type + template media slot persistence (docs/DECISIONS.md "TE-03B"). */

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = "supabase/migrations";
const M0046 = "20260911041206_0046_project_template_media_slots.sql";
const sql = readFileSync(join(ROOT, MIGRATIONS, M0046), "utf8");
const executable = sql.replace(/--.*$/gm, "");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const EE_VERSION = "22222222-2222-4222-8222-222222222221";
const VH_VERSION = "22222222-2222-4222-8222-222222222222";
const OTHER_VERSION = "22222222-2222-4222-8222-222222222223";
const MEDIA = [
  "33333333-3333-4333-8333-333333333331",
  "33333333-3333-4333-8333-333333333332",
  "33333333-3333-4333-8333-333333333333",
  "33333333-3333-4333-8333-333333333334",
  "33333333-3333-4333-8333-333333333335",
] as const;

const EE_KEY = "wedding.elegant-editorial.v1";
const VH_KEY = "wedding.vietnamese-heritage.v1";

// ---------------------------------------------------------------------------
// Migration 0046 (static)
// ---------------------------------------------------------------------------

describe("migration 0046 (static)", () => {
  it("exists as the next migration after 0044; 0045 stays retired and absent", () => {
    const names = readdirSync(join(ROOT, MIGRATIONS)).sort();
    expect(names.at(-1)).toBe(M0046);
    expect(names.some((name) => /_0045_/.test(name))).toBe(false);
    expect(names.slice(-2)).toEqual(["20260911041204_0044_republish_after_published.sql", M0046]);
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("recreates the media_type CHECK with every 0035 value plus PHOTO, in domain order", () => {
    const check = executable.match(/ADD CONSTRAINT project_media_media_type_check CHECK \(\s*media_type IN \(([^)]*)\)/);
    expect(check).not.toBeNull();
    const values = [...(check?.[1] ?? "").matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    expect(values).toEqual([...MEDIA_TYPES]);
    expect(values.at(-1)).toBe("PHOTO");
    expect(values.filter((value) => value !== "PHOTO").at(-1)).toBe("SOCIAL_SHARE_COVER");
    expect(executable).not.toMatch(/PORTRAIT_COUPLE|HERO_PHOTO|CLUSTER_/);
    expect(executable).not.toMatch(/storage\.(buckets|objects)/);
  });

  it("creates exactly one table with the exact columns", () => {
    expect(executable.match(/CREATE TABLE/g)).toHaveLength(1);
    const table = executable.match(/CREATE TABLE public\.project_template_media_slot_items \(([\s\S]*?)\n\);/)?.[1] ?? "";
    const columns = [...table.matchAll(/^\s{2}([a-z_]+)\s+(UUID|TEXT|INTEGER|TIMESTAMPTZ)/gm)].map((match) => `${match[1]} ${match[2]}`);
    expect(columns).toEqual([
      "project_id UUID",
      "template_version_id UUID",
      "slot_key TEXT",
      "position INTEGER",
      "project_media_id UUID",
      "created_by UUID",
      "created_at TIMESTAMPTZ",
    ]);
    expect(table).not.toMatch(/variant|renderer_key|updated_at|max_count/i);
    expect(table).toMatch(/project_id\s+UUID NOT NULL\s+REFERENCES public\.projects \(id\) ON DELETE CASCADE/);
    expect(table).toMatch(/template_version_id\s+UUID NOT NULL\s+REFERENCES public\.template_versions \(id\) ON DELETE RESTRICT/);
    expect(table).toMatch(/created_by\s+UUID\s+REFERENCES public\.profiles \(id\) ON DELETE SET NULL/);
    expect(table).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    expect(table).toMatch(/PRIMARY KEY \(project_id, template_version_id, slot_key, position\)/);
    expect(table).toMatch(/UNIQUE \(project_id, template_version_id, slot_key, project_media_id\)/);
    expect(table).toMatch(/CHECK \(slot_key ~ '\^\[a-z\]\[A-Za-z0-9\]\{0,47\}\$'\)/);
    expect(table).toMatch(/CHECK \(position >= 0\)/);
    expect(table).toMatch(
      /FOREIGN KEY \(project_media_id, project_id\)\s+REFERENCES public\.project_media \(id, project_id\)\s+ON DELETE NO ACTION/,
    );
    const mediaFk = table.match(/CONSTRAINT project_template_media_slot_items_media_project_fkey[\s\S]*?ON DELETE (\w+ ?\w*)/)?.[1];
    expect(mediaFk).toBe("NO ACTION");
  });

  it("grants authenticated SELECT only, forces RLS and has exactly one staff SELECT policy", () => {
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(executable).toContain(`REVOKE ALL ON TABLE public.project_template_media_slot_items FROM ${role};`);
    }
    expect(executable.match(/GRANT [A-Z, ]+ ON TABLE public\.project_template_media_slot_items TO [a-z_]+;/g)).toEqual([
      "GRANT SELECT ON TABLE public.project_template_media_slot_items TO authenticated;",
    ]);
    expect(executable).toContain("ALTER TABLE public.project_template_media_slot_items ENABLE ROW LEVEL SECURITY;");
    expect(executable).toContain("ALTER TABLE public.project_template_media_slot_items FORCE ROW LEVEL SECURITY;");
    const policies = [...executable.matchAll(/CREATE POLICY (\w+)\s+ON public\.project_template_media_slot_items\s+FOR (\w+)\s+TO (\w+)\s+USING \(([^;]*)\);/g)];
    expect(policies.map((match) => [match[1], match[2], match[3], match[4]])).toEqual([
      ["project_template_media_slot_items_select_staff", "SELECT", "authenticated", "public.is_staff()"],
    ]);
    expect(executable.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  const fn = executable.match(/CREATE FUNCTION public\.set_project_template_media_slot\([\s\S]*?\n\$\$;/)?.[0] ?? "";

  it("defines exactly one trusted RPC with a caller-untrusted signature", () => {
    expect(executable.match(/CREATE (OR REPLACE )?FUNCTION/g)).toHaveLength(1);
    expect(fn).toMatch(
      /CREATE FUNCTION public\.set_project_template_media_slot\(\s*p_project_id uuid,\s*p_template_version_id uuid,\s*p_slot_key text,\s*p_project_media_ids uuid\[\]\s*\)/,
    );
    expect(fn).not.toMatch(/p_renderer_key|p_variant|p_max|p_user|p_actor|p_created_by|p_cardinality/i);
    expect(fn).toMatch(/LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(fn).toMatch(/RETURNS TABLE \(\s*slot_key text,\s*"position" integer,\s*project_media_id uuid\s*\)/);
    expect(fn).not.toMatch(/storage_path|storage_bucket/);
  });

  it("is executable by authenticated only", () => {
    const signature = "public.set_project_template_media_slot(uuid, uuid, text, uuid[])";
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(executable).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM ${role};`);
    }
    expect(executable.match(/GRANT EXECUTE ON FUNCTION[^;]*;/g)).toEqual([`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`]);
  });

  it("self-authorizes, validates input, locks, compare-and-sets and fully replaces in order", () => {
    const order = [
      "auth.uid() IS NULL",
      "FROM public.profiles AS pr",
      "public.is_staff() IS NOT TRUE",
      "p_slot_key !~ '^[a-z][A-Za-z0-9]{0,47}$'",
      "p_project_media_ids IS NULL",
      "array_position(p_project_media_ids, NULL) IS NOT NULL",
      "count(DISTINCT m.id)",
      "FROM public.projects AS p",
      "FOR KEY SHARE",
      "FROM public.project_design AS d",
      "FOR UPDATE",
      "v_current_template_version_id IS DISTINCT FROM p_template_version_id",
      "pm.project_id = p_project_id",
      "DELETE FROM public.project_template_media_slot_items AS i",
      "INSERT INTO public.project_template_media_slot_items",
      "RETURN QUERY",
    ];
    let cursor = 0;
    for (const marker of order) {
      const index = fn.indexOf(marker, cursor);
      expect(index, marker).toBeGreaterThanOrEqual(0);
      cursor = index;
    }
    expect(fn).toMatch(/WITH ORDINALITY AS m\(id, ord\)/);
    expect(fn).toMatch(/\(m\.ord - 1\)::integer, m\.id, auth\.uid\(\)/);
    expect(fn).toMatch(/i\.project_id = p_project_id\s+AND i\.template_version_id = p_template_version_id\s+AND i\.slot_key = p_slot_key/);
    expect(fn).toMatch(/ORDER BY i\."position"/);
    for (const code of ["TM001", "TM002", "TM003", "TM004", "TM005", "TM006", "TM007"]) expect(fn).toContain(`ERRCODE = '${code}'`);
  });

  it("accepts exactly the domain slot-assignable media types", () => {
    const accepted = fn.match(/pm\.media_type IN \(([^)]*)\)/)?.[1] ?? "";
    expect([...accepted.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1])).toEqual([...TEMPLATE_SLOT_ASSIGNABLE_MEDIA_TYPES]);
  });

  it("mutates nothing outside the slot table", () => {
    const writes = [...fn.matchAll(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\.(\w+)/g)].map((match) => `${match[1]} ${match[2]}`);
    expect(writes).toEqual(["DELETE FROM project_template_media_slot_items", "INSERT INTO project_template_media_slot_items"]);
    expect(fn).not.toMatch(/invitation_versions|invitation_version_media|log_activity/);
  });

  it("TMxxx is a new range used by no other migration", () => {
    for (const name of readdirSync(join(ROOT, MIGRATIONS))) {
      if (name === M0046) continue;
      expect(readFileSync(join(ROOT, MIGRATIONS, name), "utf8"), name).not.toMatch(/ERRCODE = 'TM\d{3}'/);
    }
    expect(Object.keys(TEMPLATE_MEDIA_SLOT_RPC_ERROR_CODES)).toEqual(["TM001", "TM002", "TM003", "TM004", "TM005", "TM006", "TM007"]);
  });
});

// ---------------------------------------------------------------------------
// PHOTO upload compatibility
// ---------------------------------------------------------------------------

describe("PHOTO upload compatibility", () => {
  it("is an ordinary image upload through the existing intent and finalize validators", () => {
    expect(validateUploadIntentInput({ mediaType: "PHOTO", mimeType: "image/webp", sizeBytes: 1000 }).mediaType).toBe("PHOTO");
    expect(() => validateUploadIntentInput({ mediaType: "PHOTO", mimeType: "audio/mpeg", sizeBytes: 1000 })).toThrow();
    expect(() => validateUploadIntentInput({ mediaType: "PHOTO", mimeType: "image/jpeg", sizeBytes: 10 * 1024 * 1024 + 1 })).toThrow();
    const storagePath = `${PROJECT_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    expect(() => validateFinalizeMediaInput({ mediaType: "PHOTO", storagePath, width: 1600, height: 1200 }, PROJECT_ID)).not.toThrow();
  });

  it("is not added to the frozen legacy media editor roles", () => {
    const source = readFileSync(join(ROOT, "lib/admin/optional-content-editor.ts"), "utf8");
    expect(source).not.toMatch(/mediaType: "PHOTO"/);
  });
});

// ---------------------------------------------------------------------------
// setTemplateMediaSlot (server-side manifest validation)
// ---------------------------------------------------------------------------

type Client = { readonly tag: "client" };
const CLIENT: Client = { tag: "client" };
const STAFF: StaffContext<Client> = { userId: "44444444-4444-4444-8444-444444444444", role: "STAFF", displayName: "Staff", supabase: CLIENT };

interface Harness {
  deps: SetTemplateMediaSlotDependencies<Client>;
  replaceSlot: ReturnType<typeof vi.fn>;
  lookups: string[];
}

function harness(options: {
  designVersion?: string | null;
  rendererKey?: string | null;
  project?: boolean;
  lookup?: (key: string) => TemplateEditorManifestV1 | undefined;
} = {}): Harness {
  const designVersion = options.designVersion === undefined ? VH_VERSION : options.designVersion;
  const rendererKey = options.rendererKey === undefined ? VH_KEY : options.rendererKey;
  const lookups: string[] = [];
  const replaceSlot = vi.fn(async (_client: Client, command: ReplaceTemplateMediaSlotCommand) =>
    command.projectMediaIds.map((projectMediaId, position) => ({ slotKey: command.slotKey, position, projectMediaId })),
  );
  const slots: TemplateMediaSlotGateway<Client> = { listSlotItems: vi.fn(async () => []), replaceSlot };
  const deps: SetTemplateMediaSlotDependencies<Client> = {
    projects: { getProjectById: vi.fn(async () => (options.project === false ? null : ({ id: PROJECT_ID } as never))) },
    design: {
      getCurrentProjectDesign: vi.fn(async () => (designVersion === null ? null : ({ projectId: PROJECT_ID, templateVersionId: designVersion } as never))),
    },
    templateVersions: {
      getTemplateVersionBinding: vi.fn(async (_client: Client, id: string) => (rendererKey === null ? null : { id, rendererKey })),
    },
    slots,
    lookupEditorManifest: (key) => {
      lookups.push(key);
      return (options.lookup ?? lookupTemplateEditorManifest)(key);
    },
  };
  return { deps, replaceSlot, lookups };
}

function body(slotKey: string, ids: readonly string[], templateVersionId = VH_VERSION): unknown {
  return { templateVersionId, slotKey, projectMediaIds: [...ids] };
}

async function expectApiError(promise: Promise<unknown>, kind: string, message?: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).kind).toBe(kind);
  if (message !== undefined) expect((error as ApiError).message).toBe(message);
}

describe("setTemplateMediaSlot", () => {
  it("derives the manifest from the DB-pinned renderer, never from the caller", async () => {
    const h = harness();
    const result = await setTemplateMediaSlot(PROJECT_ID, body("portraitCluster", MEDIA.slice(0, 3)), STAFF, h.deps);
    expect(h.lookups).toEqual([VH_KEY]);
    expect(h.deps.templateVersions.getTemplateVersionBinding).toHaveBeenCalledWith(CLIENT, VH_VERSION);
    expect(result.map((item) => item.position)).toEqual([0, 1, 2]);
    await expectApiError(
      setTemplateMediaSlot(PROJECT_ID, { ...(body("heroPhoto", []) as object), rendererKey: VH_KEY }, STAFF, h.deps),
      "BAD_REQUEST",
    );
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, { ...(body("heroPhoto", []) as object), maxCount: 9 }, STAFF, h.deps), "BAD_REQUEST");
  });

  it("passes media ids to the RPC in the original order, for the current exact version only", async () => {
    const h = harness();
    const ordered = [MEDIA[3], MEDIA[0], MEDIA[4], MEDIA[1]];
    await setTemplateMediaSlot(PROJECT_ID, body("gallery", ordered), STAFF, h.deps);
    expect(h.replaceSlot).toHaveBeenCalledTimes(1);
    expect(h.replaceSlot.mock.calls[0]?.[1]).toStrictEqual({
      projectId: PROJECT_ID,
      templateVersionId: VH_VERSION,
      slotKey: "gallery",
      projectMediaIds: ordered,
    });
    expect(Object.keys(h.replaceSlot.mock.calls[0]?.[1] ?? {})).not.toContain("variant");
  });

  it("accepts an empty array (clears the slot)", async () => {
    const h = harness();
    expect(await setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", []), STAFF, h.deps)).toEqual([]);
  });

  it("rejects a caller version that is not the current design version (compare-and-set)", async () => {
    const h = harness();
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", [], OTHER_VERSION), STAFF, h.deps), "CONFLICT");
    expect(h.replaceSlot).not.toHaveBeenCalled();
    expect(h.lookups).toEqual([]);
  });

  it("fails closed when the pinned renderer has no editor manifest", async () => {
    const h = harness({ rendererKey: "wedding.unknown.v1" });
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", []), STAFF, h.deps), "INVARIANT", "Selected template version has no editor manifest");
    expect(h.replaceSlot).not.toHaveBeenCalled();
  });

  it("rejects LEGACY_ROLES templates (Elegant Editorial v1)", async () => {
    const h = harness({ designVersion: EE_VERSION, rendererKey: EE_KEY });
    await expectApiError(
      setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", [], EE_VERSION), STAFF, h.deps),
      "INVARIANT",
      "Selected template version does not use template media slots",
    );
    expect(h.replaceSlot).not.toHaveBeenCalled();
  });

  it("rejects a slot the manifest does not declare", async () => {
    const h = harness();
    for (const slotKey of ["coverPhoto", "portraitGroom", "heroPhotos"]) {
      await expectApiError(setTemplateMediaSlot(PROJECT_ID, body(slotKey, []), STAFF, h.deps), "INVARIANT", "Slot does not exist for the selected template version");
    }
    expect(h.replaceSlot).not.toHaveBeenCalled();
  });

  it("enforces SINGLE and finite maxCount; unbounded gallery accepts more than three", async () => {
    const h = harness();
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", MEDIA.slice(0, 2)), STAFF, h.deps), "INVARIANT");
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("loveStoryPhoto", MEDIA.slice(0, 2)), STAFF, h.deps), "INVARIANT");
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("portraitCluster", MEDIA.slice(0, 4)), STAFF, h.deps), "INVARIANT", "Too many photos for this slot");
    expect(h.replaceSlot).not.toHaveBeenCalled();
    expect(await setTemplateMediaSlot(PROJECT_ID, body("portraitCluster", MEDIA.slice(0, 3)), STAFF, h.deps)).toHaveLength(3);
    expect(await setTemplateMediaSlot(PROJECT_ID, body("gallery", MEDIA), STAFF, h.deps)).toHaveLength(5);
  });

  it("validates the project id, project existence and design presence", async () => {
    await expectApiError(setTemplateMediaSlot("nope", body("heroPhoto", []), STAFF, harness().deps), "BAD_REQUEST");
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", []), STAFF, harness({ project: false }).deps), "NOT_FOUND");
    await expectApiError(setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", []), STAFF, harness({ designVersion: null }).deps), "CONFLICT");
    await expect(setTemplateMediaSlot(PROJECT_ID, body("heroPhoto", []), STAFF, harness({ rendererKey: null }).deps)).rejects.toThrow(
      "Pinned template version is not readable",
    );
  });

  it("validates the body shape strictly", () => {
    const bad: unknown[] = [
      null,
      [],
      "x",
      { slotKey: "heroPhoto", projectMediaIds: [] },
      { templateVersionId: VH_VERSION, slotKey: "heroPhoto", projectMediaIds: [], extra: 1 },
      body("HeroPhoto", []),
      body("hero_photo", []),
      body("heroPhoto", ["not-a-uuid"]),
      { templateVersionId: "x", slotKey: "heroPhoto", projectMediaIds: [] },
      { templateVersionId: VH_VERSION, slotKey: "heroPhoto", projectMediaIds: null },
      body("gallery", [MEDIA[0], MEDIA[0]]),
      body("gallery", [MEDIA[0], MEDIA[0].toUpperCase()]),
      { templateVersionId: VH_VERSION, slotKey: "gallery", projectMediaIds: Array.from({ length: 501 }, () => MEDIA[0]) },
    ];
    for (const value of bad) {
      expect(() => validateSetTemplateMediaSlotInput(value), JSON.stringify(value)?.slice(0, 80)).toThrow(ApiError);
    }
  });
});

describe("listTemplateMediaSlots", () => {
  it("reads one exact Project + template version and validates ids", async () => {
    const listSlotItems = vi.fn(async () => [{ slotKey: "heroPhoto", position: 0, projectMediaId: MEDIA[0] }]);
    const slots: TemplateMediaSlotGateway<Client> = { listSlotItems, replaceSlot: vi.fn() };
    expect(await listTemplateMediaSlots(PROJECT_ID, EE_VERSION, STAFF, slots)).toHaveLength(1);
    expect(listSlotItems).toHaveBeenCalledWith(CLIENT, PROJECT_ID, EE_VERSION);
    await expectApiError(listTemplateMediaSlots("x", EE_VERSION, STAFF, slots), "BAD_REQUEST");
    await expectApiError(listTemplateMediaSlots(PROJECT_ID, "x", STAFF, slots), "BAD_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// Supabase repository
// ---------------------------------------------------------------------------

interface FakeResult {
  data: unknown;
  error: { code: string; message: string } | null;
}

function fakeClient(result: FakeResult) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = {
    select: (...args: unknown[]) => (calls.push({ method: "select", args }), chain),
    eq: (...args: unknown[]) => (calls.push({ method: "eq", args }), chain),
    order: (...args: unknown[]) => (calls.push({ method: "order", args }), chain),
    then: (resolve: (value: FakeResult) => unknown) => resolve(result),
  };
  const client = {
    from: (table: string) => (calls.push({ method: "from", args: [table] }), chain),
    rpc: async (name: string, params: unknown) => (calls.push({ method: "rpc", args: [name, params] }), result),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const row = (slot_key: string, position: number, project_media_id: string) => ({ slot_key, position, project_media_id });

describe("supabaseTemplateMediaSlotGateway", () => {
  it("lists exact columns for one Project + version and returns deterministic slot/position order", async () => {
    const { client, calls } = fakeClient({
      data: [row("heroPhoto", 0, MEDIA[0]), row("gallery", 1, MEDIA[2]), row("gallery", 0, MEDIA[1])],
      error: null,
    });
    const items = await supabaseTemplateMediaSlotGateway.listSlotItems(client, PROJECT_ID, VH_VERSION);
    expect(items).toStrictEqual<TemplateMediaSlotItem[]>([
      { slotKey: "gallery", position: 0, projectMediaId: MEDIA[1] },
      { slotKey: "gallery", position: 1, projectMediaId: MEDIA[2] },
      { slotKey: "heroPhoto", position: 0, projectMediaId: MEDIA[0] },
    ]);
    expect(calls.slice(0, 4)).toStrictEqual([
      { method: "from", args: ["project_template_media_slot_items"] },
      { method: "select", args: ["slot_key, position, project_media_id"] },
      { method: "eq", args: ["project_id", PROJECT_ID] },
      { method: "eq", args: ["template_version_id", VH_VERSION] },
    ]);
  });

  it.each([
    ["non-array", { not: "array" }],
    ["bad slot key", [row("Hero", 0, MEDIA[0])]],
    ["negative position", [row("heroPhoto", -1, MEDIA[0])]],
    ["non-integer position", [row("heroPhoto", 0.5, MEDIA[0])]],
    ["bad media id", [row("heroPhoto", 0, "x")]],
    ["gap", [row("gallery", 0, MEDIA[0]), row("gallery", 2, MEDIA[1])]],
    ["duplicate position", [row("gallery", 0, MEDIA[0]), row("gallery", 0, MEDIA[1])]],
    ["duplicate media", [row("gallery", 0, MEDIA[0]), row("gallery", 1, MEDIA[0])]],
    ["extra field leak is ignored but missing field fails", [{ slot_key: "heroPhoto", position: 0 }]],
  ])("rejects an unexpected read shape: %s", async (_label, data) => {
    const { client } = fakeClient({ data, error: null });
    await expect(supabaseTemplateMediaSlotGateway.listSlotItems(client, PROJECT_ID, VH_VERSION)).rejects.toThrow(
      "Unexpected template media slot result shape",
    );
  });

  it("calls only the trusted RPC with the exact parameters and maps the result strictly", async () => {
    const command = { projectId: PROJECT_ID, templateVersionId: VH_VERSION, slotKey: "portraitCluster", projectMediaIds: [MEDIA[2], MEDIA[0]] };
    const { client, calls } = fakeClient({ data: [row("portraitCluster", 0, MEDIA[2]), row("portraitCluster", 1, MEDIA[0])], error: null });
    expect(await supabaseTemplateMediaSlotGateway.replaceSlot(client, command)).toStrictEqual([
      { slotKey: "portraitCluster", position: 0, projectMediaId: MEDIA[2] },
      { slotKey: "portraitCluster", position: 1, projectMediaId: MEDIA[0] },
    ]);
    expect(calls).toStrictEqual([
      {
        method: "rpc",
        args: [
          "set_project_template_media_slot",
          { p_project_id: PROJECT_ID, p_template_version_id: VH_VERSION, p_slot_key: "portraitCluster", p_project_media_ids: [MEDIA[2], MEDIA[0]] },
        ],
      },
    ]);
  });

  it.each([
    ["wrong order", [row("portraitCluster", 0, MEDIA[0]), row("portraitCluster", 1, MEDIA[2])]],
    ["wrong slot", [row("gallery", 0, MEDIA[2]), row("gallery", 1, MEDIA[0])]],
    ["missing row", [row("portraitCluster", 0, MEDIA[2])]],
    ["null", null],
  ])("rejects an RPC result that does not match the submitted slot: %s", async (_label, data) => {
    const command = { projectId: PROJECT_ID, templateVersionId: VH_VERSION, slotKey: "portraitCluster", projectMediaIds: [MEDIA[2], MEDIA[0]] };
    const { client } = fakeClient({ data, error: null });
    await expect(supabaseTemplateMediaSlotGateway.replaceSlot(client, command)).rejects.toThrow("Unexpected template media slot result shape");
  });

  it("maps every TMxxx code to its fixed ApiError and anything else to a generic error", async () => {
    const command = { projectId: PROJECT_ID, templateVersionId: VH_VERSION, slotKey: "heroPhoto", projectMediaIds: [] };
    for (const [code, expected] of Object.entries(TEMPLATE_MEDIA_SLOT_RPC_ERROR_CODES)) {
      const { client } = fakeClient({ data: null, error: { code, message: "raw postgres detail with other-project data" } });
      const error = await supabaseTemplateMediaSlotGateway.replaceSlot(client, command).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe(expected.kind);
      expect((error as ApiError).message).toBe(expected.message);
      expect((error as ApiError).message).not.toContain("raw postgres");
    }
    const { client } = fakeClient({ data: null, error: { code: "23503", message: "raw" } });
    const error = await supabaseTemplateMediaSlotGateway.replaceSlot(client, command).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).toBe("Failed to replace template media slot");
  });
});

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

const TE03B_SOURCES = [
  "lib/server/template-media/template-media-slot-types.ts",
  "lib/server/template-media/template-media-slot-gateway.ts",
  "lib/server/template-media/template-media-slot-rpc-error-codes.ts",
  "lib/server/template-media/set-template-media-slot.ts",
  "lib/server/template-media/list-template-media-slots.ts",
  "lib/server/template-media/template-media-slot-supabase.ts",
  "lib/server/supabase/template-media-slot-repository.ts",
] as const;

describe("TE-03B boundaries", () => {
  it.each(TE03B_SOURCES)("%s uses no elevated credential, renderer, Snapshot or ViewModel code", (file) => {
    const code = readFileSync(join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const pattern of [
      /service-role|service_role|SERVICE_ROLE/,
      /process\.env/,
      /templates\/wedding\//,
      /renderer-binding|invitation-renderer-host|["']use client["']/,
      /snapshot-payload|invitation-view-model|extract-snapshot-media-refs/,
      /\.from\(["'](?!project_template_media_slot_items)/,
      /\.(insert|update|upsert|delete)\(/,
    ]) {
      expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
    }
  });

  it("only the production composition imports the production editor registry", () => {
    for (const file of TE03B_SOURCES) {
      const imports = /production-editor-manifests/.test(readFileSync(join(ROOT, file), "utf8"));
      expect(imports, file).toBe(file === "lib/server/template-media/template-media-slot-supabase.ts");
    }
  });

  it("adds no HTTP route and no public/customer path for slot assignment", () => {
    const routes: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !path.includes("__tests__")) routes.push(path);
      }
    };
    walk("app");
    for (const file of routes) {
      expect(/template-media|set_project_template_media_slot|project_template_media_slot_items/.test(readFileSync(join(ROOT, file), "utf8")), file).toBe(false);
    }
  });

  it("TE-04 reads draft slot rows only through the Snapshot input loader (never a renderer or stored-Snapshot read path)", () => {
    const loader = readFileSync(join(ROOT, "lib/server/invitation-snapshot/load-snapshot-payload-input.ts"), "utf8");
    expect(loader).toMatch(/templateSlots\.listSlotItems\(/);
    for (const file of [
      "lib/invitation-rendering/build-snapshot-payload.ts",
      "lib/invitation-rendering/extract-snapshot-media-refs.ts",
      "lib/invitation-rendering/build-invitation-view-model.ts",
      "lib/server/invitation-review/assert-stored-review-snapshot.ts",
      "lib/server/public-invitation/load-public-invitation.ts",
      "lib/server/customer-review/load-customer-review.ts",
      "lib/server/customer-portal/load-customer-portal.ts",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/listSlotItems|template-media-slot-gateway|project_template_media_slot_items/);
    }
  });

  it("the production editor registry still declares the slots this persistence serves", () => {
    expect(lookupTemplateEditorManifest(VH_KEY)?.mediaSlots.map((slot) => slot.key)).toEqual(["heroPhoto", "portraitCluster", "loveStoryPhoto", "gallery"]);
    expect(lookupTemplateEditorManifest(EE_KEY)?.mediaModel).toBe("LEGACY_ROLES");
  });
});
