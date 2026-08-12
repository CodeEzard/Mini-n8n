import { NhostClient } from '@nhost/nhost-js';

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
const region = process.env.NEXT_PUBLIC_NHOST_REGION;

// Support both local Nhost CLI and Nhost cloud environments
export const nhost = new NhostClient(
  subdomain && region && subdomain !== 'local'
    ? {
        subdomain,
        region,
        authUrl: process.env.NEXT_PUBLIC_NHOST_AUTH_URL,
        graphqlUrl: process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL,
        storageUrl: process.env.NEXT_PUBLIC_NHOST_STORAGE_URL,
        functionsUrl: process.env.NEXT_PUBLIC_NHOST_FUNCTIONS_URL,
      }
    : {
        subdomain: subdomain || 'local',
        region: region || undefined,
        authUrl: process.env.NEXT_PUBLIC_NHOST_AUTH_URL || 'http://localhost:1337/v1/auth',
        graphqlUrl: process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql',
        storageUrl: process.env.NEXT_PUBLIC_NHOST_STORAGE_URL || 'http://localhost:1337/v1/storage',
        functionsUrl: process.env.NEXT_PUBLIC_NHOST_FUNCTIONS_URL || 'http://localhost:1337/v1/functions',
      }
);
