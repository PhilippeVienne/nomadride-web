import { CollectionConfig } from 'payload';

export const OsmQueries: CollectionConfig = {
  slug: 'osm-queries',
  access: {
    // Shared, non-sensitive cache: safe to read publicly, but only the
    // server-side Local API (which bypasses access control) should write.
    read: () => true,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'latitude',
      type: 'number',
      required: true,
    },
    {
      name: 'longitude',
      type: 'number',
      required: true,
    },
    {
      name: 'radius',
      type: 'number',
      required: true,
    },
    {
      name: 'queriedAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'hitCount',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
      admin: {
        description: 'Nombre de requêtes utilisateur servies depuis ce cache. Utilisé par le cron de pré-chauffe pour identifier les zones populaires.',
      },
    },
    {
      name: 'lastHitAt',
      type: 'date',
      admin: {
        description: 'Dernière fois qu’une requête utilisateur a été servie depuis ce cache.',
      },
    },
  ],
};
