"use client";

import { useCallback, useEffect, useState } from "react";

export interface LightboxImage {
  src: string;
  alt: string;
}

/**
 * Shared image-preview state for prototype templates: which image is open,
 * open/close, and Escape-to-close. Each template owns the overlay markup.
 */
export function useLightbox() {
  const [image, setImage] = useState<LightboxImage | null>(null);
  const close = useCallback(() => setImage(null), []);

  useEffect(() => {
    if (!image) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [image, close]);

  return { image, open: setImage, close };
}
