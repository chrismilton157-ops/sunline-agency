import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sunline — owner',
  description: 'Sunline agency dashboards',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link
          rel="preconnect"
          href="https://rsms.me/"
        />
        <link
          rel="stylesheet"
          href="https://rsms.me/inter/inter.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
