import { describe, expect, it } from "vitest";

import { extractSnapshotMediaRefs } from "../extract-snapshot-media-refs";
import type { MediaResolver } from "../invitation-view-model-types";
import { InvitationViewModelInvariantError } from "../media-resolution";
import { resolveSnapshotMedia } from "../resolve-snapshot-media";
import {
  ADAPTER_SENTINELS,
  deepFreeze,
  recordingResolver,
  resolved,
  snapshot,
  unavailable,
  withAdapterSentinels,
} from "./invitation-view-model-fixtures";

/** Cover, gallery, audio and both QRs, with ids shared across roles. */
function duplicateRoleSnapshot() {
  const base = snapshot({
    media: {
      coverMediaId: "m-shared",
      galleryMediaIds: ["m-g1", "m-shared", "m-g2"],
      audioMediaId: "m-audio",
      qr: { groomMediaId: "m-g1", brideMediaId: "m-qr-bride" },
    },
  });
  if (base.gift.groom) base.gift.groom.bankQrMediaId = "m-g1";
  return base;
}

describe("resolveSnapshotMedia — order and deduplication (M1)", () => {
  it("calls the resolver once per unique id, in RF-02 extraction order", async () => {
    const payload = duplicateRoleSnapshot();
    const resolver = recordingResolver();

    const results = await resolveSnapshotMedia(payload, resolver);

    expect(resolver.calls).toEqual(["m-shared", "m-g1", "m-g2", "m-audio", "m-qr-bride"]);
    expect(resolver.calls).toEqual(extractSnapshotMediaRefs(payload));
    expect(results.map((result) => result.mediaId)).toEqual(resolver.calls);
  });

  it("follows cover → gallery → audio → groom QR → bride QR without sorting", async () => {
    const payload = snapshot({
      media: {
        coverMediaId: "z-cover",
        galleryMediaIds: ["y-g2", "a-g1"],
        audioMediaId: "b-audio",
        qr: { groomMediaId: "m-qr-groom", brideMediaId: "m-qr-bride" },
      },
    });
    const resolver = recordingResolver();

    await resolveSnapshotMedia(payload, resolver);

    expect(resolver.calls).toEqual(["z-cover", "y-g2", "a-g1", "b-audio", "m-qr-groom", "m-qr-bride"]);
  });

  it("never calls the resolver when the Snapshot references no media", async () => {
    const payload = snapshot({ media: { galleryMediaIds: [], qr: {} }, gift: {} });
    const resolver = recordingResolver();

    await expect(resolveSnapshotMedia(payload, resolver)).resolves.toEqual([]);
    expect(resolver.calls).toEqual([]);
  });

  it("starts every resolver call in order even when results settle out of order", async () => {
    const payload = snapshot();
    const calls: string[] = [];
    const resolver: MediaResolver = {
      resolveMedia(mediaId) {
        calls.push(mediaId);
        const delay = mediaId === "m-cover" ? 5 : 0;
        return new Promise((resolve) => setTimeout(() => resolve(resolved(mediaId)), delay));
      },
    };

    const results = await resolveSnapshotMedia(payload, resolver);

    expect(calls).toEqual(extractSnapshotMediaRefs(payload));
    expect(results.map((result) => result.mediaId)).toEqual(extractSnapshotMediaRefs(payload));
  });
});

describe("resolveSnapshotMedia — expected vs unexpected failure (M3/M4)", () => {
  it("accepts UNAVAILABLE as a normal result", async () => {
    const resolver = recordingResolver({ "m-g2": unavailable });

    const results = await resolveSnapshotMedia(snapshot(), resolver);

    expect(results).toContainEqual({ status: "UNAVAILABLE", mediaId: "m-g2" });
    expect(results).toHaveLength(7);
  });

  it("propagates the same unexpected rejection without converting it to UNAVAILABLE", async () => {
    const sentinel = new Error("UNEXPECTED_INFRASTRUCTURE_FAILURE");
    const resolver = recordingResolver({
      "m-g2": () => Promise.reject(sentinel),
    });

    await expect(resolveSnapshotMedia(snapshot(), resolver)).rejects.toBe(sentinel);
  });

  it("propagates a synchronous resolver throw unchanged", async () => {
    const sentinel = new TypeError("PROGRAMMING_FAILURE");
    const resolver: MediaResolver = {
      resolveMedia(mediaId) {
        if (mediaId === "m-audio") throw sentinel;
        return Promise.resolve(resolved(mediaId));
      },
    };

    await expect(resolveSnapshotMedia(snapshot(), resolver)).rejects.toBe(sentinel);
  });
});

describe("resolveSnapshotMedia — result validation (M2, M5)", () => {
  it("rejects a result for a different mediaId", async () => {
    const resolver = recordingResolver({ "m-cover": () => resolved("m-other") });

    await expect(resolveSnapshotMedia(snapshot(), resolver)).rejects.toThrow(InvitationViewModelInvariantError);
    await expect(resolveSnapshotMedia(snapshot(), resolver)).rejects.toThrow(/m-other.*m-cover/);
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   \t"],
  ])("rejects RESOLVED with an %s url", async (_label, url) => {
    const resolver = recordingResolver({
      "m-cover": (mediaId) => ({ status: "RESOLVED", mediaId, url, width: null, height: null }),
    });

    await expect(resolveSnapshotMedia(snapshot(), resolver)).rejects.toThrow(InvitationViewModelInvariantError);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an array", []],
    ["an unknown status", { status: "FAILED", mediaId: "m-cover" }],
    ["a missing mediaId", { status: "UNAVAILABLE" }],
    ["a missing url", { status: "RESOLVED", mediaId: "m-cover", width: null, height: null }],
    ["a missing width", { status: "RESOLVED", mediaId: "m-cover", url: "https://x", height: null }],
    ["a zero width", { status: "RESOLVED", mediaId: "m-cover", url: "https://x", width: 0, height: null }],
    ["a fractional height", { status: "RESOLVED", mediaId: "m-cover", url: "https://x", width: null, height: 1.5 }],
    ["a string height", { status: "RESOLVED", mediaId: "m-cover", url: "https://x", width: null, height: "800" }],
  ])("rejects a structurally impossible result: %s", async (_label, value) => {
    const resolver = recordingResolver({ "m-cover": () => value });

    await expect(resolveSnapshotMedia(snapshot(), resolver)).rejects.toThrow(InvitationViewModelInvariantError);
  });

  it("keeps RESOLVED with null dimensions as RESOLVED", async () => {
    const resolver = recordingResolver({ "m-cover": (mediaId) => resolved(mediaId, null, null) });

    const results = await resolveSnapshotMedia(snapshot(), resolver);

    expect(results[0]).toEqual({
      status: "RESOLVED",
      mediaId: "m-cover",
      url: expect.stringContaining("m-cover"),
      width: null,
      height: null,
    });
  });

  it("projects only the frozen fields, dropping adapter extras", async () => {
    const resolver = recordingResolver({
      "m-cover": (mediaId) => withAdapterSentinels(resolved(mediaId)),
      "m-audio": (mediaId) => withAdapterSentinels(unavailable(mediaId)),
    });

    const results = await resolveSnapshotMedia(snapshot(), resolver);

    const serialized = JSON.stringify(results);
    for (const value of Object.values(ADAPTER_SENTINELS)) {
      expect(serialized).not.toContain(JSON.stringify(value).replace(/^"|"$/g, ""));
    }
    expect(Object.keys(results[0]).sort()).toEqual(["height", "mediaId", "status", "url", "width"]);
    expect(results.find((result) => result.mediaId === "m-audio")).toStrictEqual({
      status: "UNAVAILABLE",
      mediaId: "m-audio",
    });
  });

  it("does not mutate the Snapshot", async () => {
    const payload = deepFreeze(snapshot());
    const before = structuredClone(payload);

    await resolveSnapshotMedia(payload, recordingResolver());

    expect(payload).toStrictEqual(before);
  });
});
