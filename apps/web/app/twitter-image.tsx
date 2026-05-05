export { default } from "./opengraph-image";
export { alt, size, contentType } from "./opengraph-image";

import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://aegis.fi"),
};