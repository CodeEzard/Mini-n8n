import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../components/providers';
import { Navbar } from '../components/navbar';

export const metadata: Metadata = {
  title: 'Mini-n8n — AI Agent Workflow Builder',
  description:
    'Multi-tenant AI Agent workflow builder powered by Nhost, Hasura, and Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1 pb-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
