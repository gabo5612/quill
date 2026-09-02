'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useSyncExternalStore } from 'react'

const THEMES = ['system', 'light', 'dark'] as const
type Theme = (typeof THEMES)[number]

const icons: Record<Theme, React.ReactNode> = {
  system: <Monitor size={16} />,
  light:  <Sun size={16} />,
  dark:   <Moon size={16} />,
}

const labels: Record<Theme, string> = {
  system: 'System',
  light:  'Light',
  dark:   'Dark',
}

/** Never changes, so the store never notifies — this is a pure hydration probe. */
const noopSubscribe = () => () => {}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  // The resolved theme is only known on the client. useSyncExternalStore gives
  // us "am I hydrated?" without a setState-in-effect render cascade.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,   // client
    () => false,  // server / first render
  )

  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors"
      >
        <Monitor size={16} />
      </button>
    )
  }

  const current = (theme as Theme) ?? 'system'
  const currentIndex = THEMES.indexOf(current) ?? 0
  const nextTheme = THEMES[(currentIndex + 1) % THEMES.length]

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${labels[nextTheme]} theme`}
      title={`Current: ${labels[current]} — click for ${labels[nextTheme]}`}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
    >
      {icons[current]}
    </button>
  )
}
