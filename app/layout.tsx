import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GEDTree',
  description: 'GEDTree - Ferramenta de Genealogia',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
