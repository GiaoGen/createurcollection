import { toPng } from "html-to-image";

/**
 * Render the 2D export card node (`#cyc-export-card`) to a PNG dataURL.
 *
 * - `pixelRatio: 2` → a 2400×1800 PNG for the 1200×900 card.
 * - `cacheBust: true` helps when the card references external images; the
 *   card itself always bakes artwork to dataURLs, so the bust only ever hits
 *   same-origin font resources.
 * - The `style` override resets the live node's off-screen hiding styles on
 *   the cloned node. html-to-image inlines computed styles onto the clone, so
 *   `position: fixed; left: -9999px` would otherwise shift the capture out of
 *   the SVG viewport and produce a blank image.
 */
export async function exportCardPng(node: HTMLElement): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#f5f5f3",
    style: {
      position: "absolute",
      left: "0",
      top: "0",
      margin: "0",
    },
  });
}
