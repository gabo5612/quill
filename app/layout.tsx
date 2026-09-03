import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s — Quill',
    default:  'Quill',
  },
  description: 'Editorial tool for AI-powered content generation and management.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="min-h-full antialiased font-aeonik">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--surface)',
                color:      'var(--text)',
                border:     '1px solid var(--border)',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
