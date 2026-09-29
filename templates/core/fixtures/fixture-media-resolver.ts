import type {
  MediaResolution,
  MediaResolver,
} from "../../../lib/invitation-rendering/invitation-view-model-types";
import { FIXTURE_MEDIA_DIMENSIONS } from "./renderer-fixture-sources";

/**
 * Invitation Rendering Foundation RF-06A — deterministic fixture
 * `MediaResolver` over the frozen RF-03 contract (docs/DECISIONS.md RF-03
 * M1–M5; "RF-06-0 …" P38).
 *
 * No storage lookup, no signing, no network. `RESOLVED` URLs are inert
 * `.invalid` (RFC 2606) test URLs derived only from the media id, never a
 * production asset path. Ids listed in `unavailableMediaIds` resolve to the
 * normal `UNAVAILABLE` state.
 */

export const FIXTURE_MEDIA_URL_BASE = "https://renderer-fixtures.invalid/media/";

export function fixtureMediaUrl(mediaId: string): string {
  return `${FIXTURE_MEDIA_URL_BASE}${encodeURIComponent(mediaId)}`;
}

export interface FixtureMediaResolverOptions {
  unavailableMediaIds?: readonly string[];
}

export function createFixtureMediaResolver(options: FixtureMediaResolverOptions = {}): MediaResolver {
  const unavailable = new Set(options.unavailableMediaIds ?? []);
  return Object.freeze({
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      if (unavailable.has(mediaId)) {
        return { status: "UNAVAILABLE", mediaId };
      }
      const dimensions = Object.prototype.hasOwnProperty.call(FIXTURE_MEDIA_DIMENSIONS, mediaId)
        ? FIXTURE_MEDIA_DIMENSIONS[mediaId]
        : undefined;
      return {
        status: "RESOLVED",
        mediaId,
        url: fixtureMediaUrl(mediaId),
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      };
    },
  });
}
