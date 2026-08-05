import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NomadRide',
    short_name: 'NomadRide',
    description: 'Carte interactive de vos trajets et stations service',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b0f19',
    theme_color: '#f97316',
    categories: ['travel', 'navigation'],
    lang: 'fr',
    shortcuts: [
      {
        name: 'Pit-Stop',
        short_name: 'Pit-Stop',
        description: "Trouver la station-service la moins chère à proximité",
        url: '/pitstop',
      },
    ],
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192x192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
