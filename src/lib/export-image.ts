import { toPng } from "html-to-image";

/**
 * Render the 2D export card node (`#cyc-export-card`) to a PNG dataURL.
 *
 * - `pixelRatio: 2` → a 2400×1800 PNG for the 1200×900 card.
 * - The `style` override resets the live node's off-screen hiding styles on
 *   the cloned node. html-to-image inlines computed styles onto the clone, so
 *   `position: fixed; left: -9999px` would otherwise shift the capture out of
 *   the SVG viewport and produce a blank image.
 *
 * Note: there is deliberately no `cacheBust`. Every image inside the card is
 * baked to a dataURL (`bakeFilteredUrl`), which html-to-image embeds directly
 * and skips during busting; fonts are inlined via `embedFonts`, which ignores
 * `cacheBust`. The option would therefore be a no-op for this card.
 */
export async function exportCardPng(node: HTMLElement): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    backgroundColor: "#f5f5f3",
    style: {
      position: "absolute",
      left: "0",
      top: "0",
      margin: "0",
    },
  });
}
