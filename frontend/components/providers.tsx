'use client';

import React, { useMemo } from 'react';
import { NhostProvider } from '@nhost/react';
import { ApolloProvider } from '@apollo/client';
import { nhost } from '../lib/nhost';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { createApolloClient } from '../lib/apollo-client';

function ApolloClientWrapper({ children }: { children: React.ReactNode }) {
  const { getAuthHeaders, userId, activeOrgId } = useAuth();

  const client = useMemo(() => {
    return createApolloClient(getAuthHeaders);
  }, [userId, activeOrgId]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NhostProvider nhost={nhost}>
      <AuthProvider>
        <ApolloClientWrapper>{children}</ApolloClientWrapper>
      </AuthProvider>
    </NhostProvider>
  );
}
