import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateProjectEventInput } from "../../server/project-events/validate-project-event-input";
import type { ProjectEventRecord } from "../../server/project-events/project-events-types";
import { validateSaveWeddingDetailsInput } from "../../server/wedding-details/validate-save-wedding-details-input";
import type { WeddingDetailsRecord } from "../../server/wedding-details/wedding-details-types";
import {
  buildCeremonyEventBody,
  buildWeddingDetailsSaveBody,
  CEREMONY_SLOTS,
  ceremonyFormFrom,
  civilToInstantIso,
  coupleNamesFormFrom,
  findCeremonySlotEvent,
  type CeremonyEventForm,
} from "../required-invitation-data";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const [GROOM_SLOT, BRIDE_SLOT] = CEREMONY_SLOTS;

function details(overrides: Partial<WeddingDetailsRecord> = {}): WeddingDetailsRecord {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    projectId: PROJECT_ID,
    groomName: "Old Groom",
    brideName: null,
    groomFather: "Ông A",
    groomMother: null,
    brideFather: null,
    brideMother: "Bà B",
    groomFamilyAddress: null,
    brideFamilyAddress: null,
    invitationMessage: "Trân trọng",
    loveStory: null,
    lunarDateDisplay: null,
    additionalNote: "internal",
    groomBankName: null,
    groomBankAccountName: null,
    groomBankAccountNumber: null,
    groomBankQrMediaId: "33333333-3333-4333-8333-333333333333",
    brideBankName: null,
    brideBankAccountName: null,
    brideBankAccountNumber: null,
    brideBankQrMediaId: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function event(overrides: Partial<ProjectEventRecord> = {}): ProjectEventRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: PROJECT_ID,
    occasionType: "THANH_HON",
    side: "GROOM",
    title: "Lễ Thành Hôn",
    startsAt: "2026-12-20T03:30:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    venueName: "Nhà trai",
    address: null,
    mapUrl: "https://maps.example/x",
    description: "desc",
    sortOrder: 5,
    isPrimary: true,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    lunarDateDisplay: null,
    ...overrides,
  };
}

const FORM: CeremonyEventForm = {
  title: "Lễ Vu Quy",
  date: "2026-12-19",
  time: "09:00",
  venueName: "",
  address: "  ",
  lunarDateDisplay: "Ngày 30 tháng 10 năm Bính Ngọ",
  mapUrl: "",
};

describe("ceremony slots (side → rite from WEDDING_VARIANT_RULES)", () => {
  it("GROOM uses THANH_HON and BRIDE uses VU_QUY, in GROOM-then-BRIDE order", () => {
    expect(CEREMONY_SLOTS.map((slot) => [slot.side, slot.occasionType])).toEqual([
      ["GROOM", "THANH_HON"],
      ["BRIDE", "VU_QUY"],
    ]);
    expect(GROOM_SLOT.label).toContain("Lễ Thành Hôn");
    expect(BRIDE_SLOT.label).toContain("Lễ Vu Quy");
  });

  it("never substitutes the other side or the other rite", () => {
    const groomVuQuy = event({ occasionType: "VU_QUY" });
    const brideThanhHon = event({ side: "BRIDE", occasionType: "THANH_HON" });
    const commonThanhHon = event({ side: "COMMON" });
    expect(findCeremonySlotEvent([groomVuQuy, brideThanhHon, commonThanhHon], GROOM_SLOT)).toEqual({ kind: "NEW" });
    expect(findCeremonySlotEvent([groomVuQuy, brideThanhHon, commonThanhHon], BRIDE_SLOT)).toEqual({ kind: "NEW" });
  });

  it("picks the exact single match, else the side's primary, else reports ambiguity", () => {
    const a = event({ id: "a", isPrimary: false });
    const b = event({ id: "b", isPrimary: true });
    expect(findCeremonySlotEvent([a], GROOM_SLOT)).toEqual({ kind: "EXISTING", event: a });
    expect(findCeremonySlotEvent([a, b], GROOM_SLOT)).toEqual({ kind: "EXISTING", event: b });
    expect(findCeremonySlotEvent([a, { ...a, id: "c" }], GROOM_SLOT)).toEqual({ kind: "AMBIGUOUS", count: 2 });
  });

  it("the built body always carries the slot's side/rite and passes the server validator", () => {
    const built = buildCeremonyEventBody(BRIDE_SLOT, FORM, null);
    if (!built.ok) throw new Error(built.error);
    expect(built.body.side).toBe("BRIDE");
    expect(built.body.occasionType).toBe("VU_QUY");
    expect(validateProjectEventInput(built.body)).toEqual({ ...built.body, address: null, venueName: null });
  });
});

describe("buildCeremonyEventBody", () => {
  it("new event: civil time in Asia/Ho_Chi_Minh, DB-default sort/primary, optional text null, lunar verbatim", () => {
    const built = buildCeremonyEventBody(BRIDE_SLOT, FORM, null);
    expect(built).toEqual({
      ok: true,
      body: {
        occasionType: "VU_QUY",
        side: "BRIDE",
        title: "Lễ Vu Quy",
        startsAt: "2026-12-19T02:00:00.000Z",
        timezone: "Asia/Ho_Chi_Minh",
        venueName: null,
        address: null,
        mapUrl: null,
        description: null,
        sortOrder: 0,
        isPrimary: false,
        lunarDateDisplay: "Ngày 30 tháng 10 năm Bính Ngọ",
      },
    });
  });

  it("existing event keeps its timezone, description, sort order and primary flag; map URL comes from the loaded form", () => {
    const existing = event({ timezone: "Asia/Tokyo" });
    const form = { ...FORM, title: "Lễ Thành Hôn", mapUrl: ceremonyFormFrom(existing).mapUrl };
    const built = buildCeremonyEventBody(GROOM_SLOT, form, existing);
    if (!built.ok) throw new Error(built.error);
    expect(built.body).toMatchObject({
      side: "GROOM",
      occasionType: "THANH_HON",
      timezone: "Asia/Tokyo",
      startsAt: "2026-12-19T00:00:00.000Z",
      mapUrl: existing.mapUrl,
      description: existing.description,
      sortOrder: 5,
      isPrimary: true,
    });
  });

  it.each([
    [{ title: " " }],
    [{ date: "" }],
    [{ time: "" }],
    [{ date: "2026-02-30" }],
    [{ time: "25:00" }],
  ])("rejects missing/invalid required input %j", (patch) => {
    expect(buildCeremonyEventBody(GROOM_SLOT, { ...FORM, ...patch }, null).ok).toBe(false);
  });

  it("loads the canonical mapUrl into the form, and an empty one as blank (never invented)", () => {
    expect(ceremonyFormFrom(event()).mapUrl).toBe("https://maps.example/x");
    expect(ceremonyFormFrom(event({ mapUrl: null })).mapUrl).toBe("");
  });

  it("saves a trimmed Google Maps link per side, accepted by the server validator", () => {
    const groomLink = "https://maps.app.goo.gl/GroomHome123";
    const brideLink = "https://www.google.com/maps/place/Nh%C3%A0+g%C3%A1i/@10.77,106.70,17z";
    const groom = buildCeremonyEventBody(GROOM_SLOT, { ...FORM, title: "Lễ Thành Hôn", mapUrl: `  ${groomLink} ` }, null);
    const bride = buildCeremonyEventBody(BRIDE_SLOT, { ...FORM, mapUrl: brideLink }, null);
    if (!groom.ok || !bride.ok) throw new Error("expected ok");
    expect(groom.body.mapUrl).toBe(groomLink);
    expect(bride.body.mapUrl).toBe(brideLink);
    expect(validateProjectEventInput(groom.body).mapUrl).toBe(groomLink);
    expect(validateProjectEventInput(bride.body).mapUrl).toBe(brideLink);
  });

  it("edits and clears an existing map URL while preserving timezone, side and other fields", () => {
    const existing = event({ timezone: "Asia/Tokyo" });
    const loaded = ceremonyFormFrom(existing);
    const edited = buildCeremonyEventBody(GROOM_SLOT, { ...loaded, mapUrl: "https://maps.app.goo.gl/New" }, existing);
    const cleared = buildCeremonyEventBody(GROOM_SLOT, { ...loaded, mapUrl: "   " }, existing);
    if (!edited.ok || !cleared.ok) throw new Error("expected ok");
    expect(edited.body.mapUrl).toBe("https://maps.app.goo.gl/New");
    expect(cleared.body.mapUrl).toBeNull();
    for (const body of [edited.body, cleared.body]) {
      expect(body).toMatchObject({
        side: "GROOM",
        occasionType: "THANH_HON",
        timezone: "Asia/Tokyo",
        startsAt: existing.startsAt,
        title: existing.title,
        venueName: existing.venueName,
        description: existing.description,
        sortOrder: existing.sortOrder,
        isPrimary: existing.isPrimary,
      });
      expect(validateProjectEventInput(body).mapUrl).toBe(body.mapUrl);
    }
  });

  it.each([["http://maps.google.com/x"], ["maps.app.goo.gl/x"], ["javascript:alert(1)"], ["https://"]])(
    "rejects a non-https or malformed map URL %j (as the server would)",
    (mapUrl) => {
      const built = buildCeremonyEventBody(GROOM_SLOT, { ...FORM, mapUrl }, null);
      expect(built.ok).toBe(false);
      expect(() => validateProjectEventInput({ ...buildBodyWithoutMap(), mapUrl })).toThrow();
    },
  );

  it("round-trips the canonical instant back to the same civil form", () => {
    const existing = event();
    const form = ceremonyFormFrom(existing);
    expect(form).toMatchObject({ date: "2026-12-20", time: "10:30" });
    const built = buildCeremonyEventBody(GROOM_SLOT, form, existing);
    expect(built.ok && built.body.startsAt).toBe(existing.startsAt);
  });

  it("civilToInstantIso rejects a non-existent DST civil time instead of shifting it", () => {
    expect(civilToInstantIso("2026-03-08", "02:30", "America/New_York")).toBeNull();
    expect(civilToInstantIso("2026-03-08", "03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });
});

function buildBodyWithoutMap() {
  const built = buildCeremonyEventBody(GROOM_SLOT, { ...FORM, title: "Lễ Thành Hôn" }, null);
  if (!built.ok) throw new Error(built.error);
  return built.body;
}

describe("buildWeddingDetailsSaveBody", () => {
  it("load empty: blank form; first save sends only the names with every other field null", () => {
    expect(coupleNamesFormFrom(null)).toEqual({ groomName: "", brideName: "" });
    const built = buildWeddingDetailsSaveBody(null, { groomName: "Minh", brideName: "Lan" });
    if (!built.ok) throw new Error(built.error);
    expect(validateSaveWeddingDetailsInput(built.body)).toEqual(built.body);
    const nonNull = Object.entries(built.body).filter(([, value]) => value !== null);
    expect(nonNull).toEqual([
      ["groomName", "Minh"],
      ["brideName", "Lan"],
    ]);
  });

  it("update preserves every other existing field unchanged", () => {
    const current = details();
    const built = buildWeddingDetailsSaveBody(current, { groomName: "Minh", brideName: "Lan" });
    if (!built.ok) throw new Error(built.error);
    expect(built.body).toMatchObject({
      groomName: "Minh",
      brideName: "Lan",
      groomFather: "Ông A",
      brideMother: "Bà B",
      invitationMessage: "Trân trọng",
      additionalNote: "internal",
      groomBankQrMediaId: current.groomBankQrMediaId,
    });
    expect(Object.keys(built.body)).toHaveLength(20);
  });

  it.each([
    [{ groomName: "", brideName: "Lan" }],
    [{ groomName: "Minh", brideName: "   " }],
  ])("rejects a blank required name %j (no fallback name)", (form) => {
    expect(buildWeddingDetailsSaveBody(null, form).ok).toBe(false);
  });
});

describe("static boundaries", () => {
  const root = join(__dirname, "..", "..", "..");
  const sources = [
    "lib/admin/required-invitation-data.ts",
    "app/admin/v2/projects/[projectId]/_components/required-invitation-data.tsx",
  ].map((file) => readFileSync(join(root, file), "utf8"));

  it("no service role, direct Supabase access, publish, invitation_versions or design/catalog write", () => {
    for (const source of sources) {
      expect(source).not.toMatch(
        /service_role|SERVICE_ROLE|createClient|\.from\(|invitation_versions|\/publish|saveProjectDesign|template_versions/,
      );
    }
  });
});
