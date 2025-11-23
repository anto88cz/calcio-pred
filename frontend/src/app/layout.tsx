import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Calcio-Pred - Predizioni Calcio',
  description: 'Predizioni calcio basate su dati storici reali (API-FOOTBALL). Motore: 60% Empirico + 40% Poisson con Dixon-Coles.',
  keywords: 'calcio, predizioni, pronostici, API-FOOTBALL, poisson, dixon-coles, empirico',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className={inter.className}>
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
