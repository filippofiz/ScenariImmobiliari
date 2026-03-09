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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
