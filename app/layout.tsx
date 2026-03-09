import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Scenari Immobiliari — RAG Dashboard',
  description: 'Analisi intelligente del Rapporto Fondi Immobiliari',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
