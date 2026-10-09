import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

interface MediaImageProps {
  media: ResolvedMedia;
  alt: string;
  className?: string;
  /** Above-the-fold media loads eagerly; everything else is lazy. */
  eager?: boolean;
}

/**
 * Renders a `RESOLVED` media item at its runtime URL, exactly as given: no
 * storage lookup, signing, rewriting or substitute. Only a `ResolvedMedia` is
 * accepted, so an `UNAVAILABLE` item can never produce a broken image. Known
 * intrinsic dimensions reserve layout space; `null` dimensions are omitted.
 */
export function MediaImage({ media, alt, className, eager = false }: MediaImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URLs, not build-known assets
    <img
      className={className}
      src={media.url}
      alt={alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}

/** The first `RESOLVED` item of a SINGLE slot, or `undefined` (absent, empty or `UNAVAILABLE`). */
export function singleResolved(items: readonly MediaResolution[] | undefined): ResolvedMedia | undefined {
  const first = items?.[0];
  return first?.status === "RESOLVED" ? first : undefined;
}
