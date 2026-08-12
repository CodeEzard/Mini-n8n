import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  split,
} from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { setContext } from '@apollo/client/link/context';
import { nhost } from './nhost';

export function getFrontendGraphQLEndpoint(): string {
  if (process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL) {
    return process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL;
  }
  if (process.env.NEXT_PUBLIC_GRAPHQL_URL) {
    return process.env.NEXT_PUBLIC_GRAPHQL_URL;
  }
  if (process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN && process.env.NEXT_PUBLIC_NHOST_REGION) {
    return `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // If deployed on custom domain with reverse proxy
    return `${window.location.origin}/v1/graphql`;
  }
  return 'http://localhost:1337/v1/graphql';
}

export function createApolloClient(getAuthHeaders?: () => Record<string, string>) {
  const httpUrl = getFrontendGraphQLEndpoint();
  const wsUrl = httpUrl.replace(/^http/, 'ws');

  const httpLink = new HttpLink({
    uri: httpUrl,
  });

  const authLink = setContext(async (_, { headers }) => {
    const token = nhost.auth.getAccessToken();
    const customHeaders = getAuthHeaders ? getAuthHeaders() : {};

    return {
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...customHeaders,
      },
    };
  });

  // Client-side WebSocket Link for subscriptions
  let link = authLink.concat(httpLink);

  if (typeof window !== 'undefined') {
    const wsLink = new GraphQLWsLink(
      createClient({
        url: wsUrl,
        connectionParams: () => {
          const token = nhost.auth.getAccessToken();
          const customHeaders = getAuthHeaders ? getAuthHeaders() : {};
          return {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...customHeaders,
            },
          };
        },
        shouldRetry: () => true,
      })
    );

    link = split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      authLink.concat(httpLink)
    );
  }

  return new ApolloClient({
    link,
    cache: new InMemoryCache({
      typePolicies: {
        workflow_runs: {
          keyFields: ['id'],
        },
        step_runs: {
          keyFields: ['id'],
        },
        workflows: {
          keyFields: ['id'],
        },
      },
    }),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network',
      },
    },
  });
}
