import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

interface MediaImageProps {
  media: ResolvedMedia;
  alt: string;
  className?: string;
  /** Above-the-fold media loads eagerly; everything else is lazy. */
  eager?: boolean;
}

/**
 * Renders a `RESOLVED` media item at its runtime URL, exactly as given: no
 * storage lookup, signing, rewriting or substitute (RF-03 A2, RF13). Only a
 * `ResolvedMedia` is accepted, so an `UNAVAILABLE` item can never produce a
 * broken image element. Known intrinsic dimensions are passed through to
 * reserve layout space; `null` dimensions are simply omitted (M13).
 *
 * A plain `<img>` is deliberate: runtime URLs are opaque per-request URLs
 * from the injected MediaResolver, not build-known assets for the Next
 * image optimizer.
 */
export function MediaImage({ media, alt, className, eager = false }: MediaImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URLs (see above)
    <img
      className={className}
      src={media.url}
      alt={alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
