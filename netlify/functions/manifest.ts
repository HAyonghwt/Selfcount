import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  const manifest = {
    id: "/",
    name: "파크골프대회",
    short_name: "파크골프대회",
    theme_color: "#e85461",
    background_color: "#ffffff",
    display: "standalone",
    scope: "/",
    start_url: "/",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ],
    orientation: "portrait",
    prefer_related_applications: false
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
    body: JSON.stringify(manifest),
  };
};
