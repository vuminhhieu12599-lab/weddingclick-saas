import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FIXTURE_MEDIA_IDS } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import {
  HARNESS_AUDIO_FILE,
  HARNESS_MEDIA_BASE_PATH,
  HARNESS_SCENARIO_IDS,
  buildHarnessRenderData,
} from "../harness-scenarios";

/**
 * RF-06D rights-safe harness audio fixture (docs/DECISIONS.md "RF-06-0 …"
 * P38). The committed WAV must be byte-identical to the output of the small
 * integer algorithm below, which is the recorded provenance
 * (../harness-audio-provenance.md): generated in-repo, no external source.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const WAV_PATH = join(REPO_ROOT, "public", "internal", "renderer-harness", HARNESS_AUDIO_FILE);
const PROVENANCE_PATH = join(__dirname, "..", "harness-audio-provenance.md");

const SAMPLE_RATE = 8000;
const SAMPLE_COUNT = 16000;
const PERIOD = 20;
const HALF = 10;
const AMPLITUDE = 2;
const FADE = 800;

/** 8-bit unsigned PCM triangle tone with a linear fade at both ends; integer arithmetic only. */
function sample(index: number): number {
  const phase = index % PERIOD;
  const triangle = (phase < HALF ? phase : PERIOD - phase) * 2 - HALF;
  const envelope = Math.min(index, SAMPLE_COUNT - 1 - index, FADE);
  return 128 + Math.trunc((triangle * AMPLITUDE * envelope) / FADE);
}

function generateWav(): Buffer {
  const bytes = Buffer.alloc(44 + SAMPLE_COUNT);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + SAMPLE_COUNT, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SAMPLE_RATE, 24);
  bytes.writeUInt32LE(SAMPLE_RATE, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(SAMPLE_COUNT, 40);
  for (let index = 0; index < SAMPLE_COUNT; index += 1) bytes[44 + index] = sample(index);
  return bytes;
}

describe("harness audio fixture bytes", () => {
  const committed = readFileSync(WAV_PATH);

  it("is byte-identical to the in-repo deterministic generator", () => {
    expect(committed.equals(generateWav())).toBe(true);
  });

  it("has a pinned SHA-256", () => {
    expect(createHash("sha256").update(committed).digest("hex")).toBe(
      "f619c22e21ffb5161147f82ec567d3ce0ee14e0c0673c04ec71178d9334c2c37",
    );
  });

  it("is a small PCM WAVE file (2 s, 8 kHz, 8-bit mono)", () => {
    expect(statSync(WAV_PATH).size).toBe(16044);
    expect(committed.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(committed.subarray(8, 16).toString("ascii")).toBe("WAVEfmt ");
    expect(committed.readUInt16LE(20)).toBe(1);
    expect(committed.readUInt32LE(24)).toBe(SAMPLE_RATE);
  });

  it("is quiet and click-free at the loop point (silence at both ends)", () => {
    const samples = committed.subarray(44);
    expect(samples[0]).toBe(128);
    expect(samples[samples.length - 1]).toBe(128);
    expect(Math.max(...samples) - 128).toBeLessThanOrEqual(20);
    expect(128 - Math.min(...samples)).toBeLessThanOrEqual(20);
  });

  it("carries no metadata chunk, text or URL", () => {
    expect(committed.subarray(36, 40).toString("ascii")).toBe("data");
    expect(committed.toString("latin1")).not.toMatch(/https?:|LIST|INFO|ID3/);
  });
});

describe("harness audio wiring", () => {
  it("only music-resolved resolves the canonical audio slot, through the real pipeline, to the local file", async () => {
    for (const id of HARNESS_SCENARIO_IDS) {
      const { viewModel, sections } = await buildHarnessRenderData(id);
      if (id === "music-resolved") {
        expect(viewModel.media.audio).toStrictEqual({
          status: "RESOLVED",
          mediaId: FIXTURE_MEDIA_IDS.AUDIO,
          url: `${HARNESS_MEDIA_BASE_PATH}${HARNESS_AUDIO_FILE}`,
          width: null,
          height: null,
        });
        expect(sections.music).toBe(true);
      } else {
        expect(viewModel.media.audio?.status, id).toBe("UNAVAILABLE");
      }
    }
  });

  it("the URL is a same-origin local path, never external or production", () => {
    expect(`${HARNESS_MEDIA_BASE_PATH}${HARNESS_AUDIO_FILE}`).toBe("/internal/renderer-harness/audio-tone.wav");
  });

  it("the provenance note states the factual in-repo generation and no external source", () => {
    const note = readFileSync(PROVENANCE_PATH, "utf8");
    for (const required of ["generated in this repository", "External sources:** none", "harness-audio-fixture.test.ts", "Task 029"]) {
      expect(note, required).toContain(required);
    }
    expect(note).not.toMatch(/licen[cs]e|copyright|royalty/i);
  });
});
