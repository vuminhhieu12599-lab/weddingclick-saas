import { extractSnapshotMediaRefs } from "./extract-snapshot-media-refs";
import type { MediaResolution, MediaResolver } from "./invitation-view-model-types";
import { InvitationViewModelInvariantError, projectMediaResolution } from "./media-resolution";
import type { SnapshotPayloadV1 } from "./snapshot-payload-types";

/**
 * RF-03 Layer A — async media resolution boundary (docs/DECISIONS.md RF-03
 * clarification A1, M1–M5).
 *
 * The referenced ids and their order come only from the frozen RF-02
 * extractor (cover → gallery → audio → groom QR → bride QR, first reference
 * wins). Each unique id is passed to the injected resolver exactly once,
 * in that order, and the result is shared by every role that references it.
 *
 * Returns the complete resolution set in extractor order. Resolver throws
 * are deliberately not caught: unexpected failures propagate unchanged
 * (M4) and are never turned into `UNAVAILABLE`. A result for a different id,
 * or a malformed result, is an `InvitationViewModelInvariantError`.
 */
export async function resolveSnapshotMedia(
  snapshot: SnapshotPayloadV1,
  resolver: MediaResolver,
): Promise<MediaResolution[]> {
  const mediaIds = extractSnapshotMediaRefs(snapshot);

  // Each async callback calls the resolver before its first await, so
  // resolver invocations happen synchronously in extractor order.
  return Promise.all(
    mediaIds.map(async (requestedId) => {
      const projected = projectMediaResolution(await resolver.resolveMedia(requestedId));
      if (projected.mediaId !== requestedId) {
        throw new InvitationViewModelInvariantError(
          `Media resolver returned a result for ${projected.mediaId} when ${requestedId} was requested`,
        );
      }
      return projected;
    }),
  );
}
