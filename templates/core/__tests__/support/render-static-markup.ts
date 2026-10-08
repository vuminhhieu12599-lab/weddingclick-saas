import type { ReactNode } from "react";
import { prerender } from "react-dom/static";

/**
 * RS-01 test support: production renderers are `React.lazy` (one chunk per
 * renderer key), and `renderToStaticMarkup` cannot wait for a suspended lazy
 * component. This renders with React's public static `prerender`, which
 * waits for every Suspense boundary, and removes only the comment markers it
 * adds (Suspense boundaries `<!--$-->` / `<!--/$-->` and text separators
 * `<!-- -->`), so the result is comparable with `renderToStaticMarkup`.
 */
export async function renderToStaticMarkupAsync(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element);
  const html = await new Response(prelude).text();
  return html.replace(/<!--\/?\$-->|<!-- -->/g, "");
}
