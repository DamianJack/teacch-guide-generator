import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Visual Work Instructions",
    short_name: "Work Instructions",
    description: "Create editable visual work instructions from workplace photos and notes.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#245d49",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
