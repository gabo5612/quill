import { signInWithGoogle } from '@/lib/supabase/actions'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; redirectTo?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized_domain: 'Unauthorized account. Only @example.com accounts are allowed.',
  auth_failed: 'Authentication error. Please try again.',
  default: 'An error occurred. Please try again.',
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorKey = params.error
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.default)
    : null

  return (
    <div className="min-h-screen bg-[#1C1C1C] flex flex-col items-center justify-center px-4">
      {/* Subtle grid texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 39px, #F2F2F2 39px, #F2F2F2 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, #F2F2F2 39px, #F2F2F2 40px)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-10">
        {/* Wordmark block */}
        <div className="flex flex-col items-center gap-3">
          {/* Quill monogram */}
          <div className="flex items-center justify-center w-12 h-12 rounded-[var(--radius-md)] bg-[#4F46E5]">
            <span
              className="text-[#F8F8F8] font-bold leading-none select-none"
              style={{ fontFamily: '"PP Fragment", Georgia, serif', fontSize: '1.375rem' }}
            >
              M
            </span>
          </div>

          {/* Tool name */}
          <div className="flex flex-col items-center gap-0.5">
            <span
              className="text-[#F2F2F2] tracking-tight leading-none"
              style={{ fontFamily: '"PP Fragment", Georgia, serif', fontSize: '1.5rem' }}
            >
              Content Tool
            </span>
            <span
              className="text-[#858585] text-sm tracking-wide uppercase"
              style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif', letterSpacing: '0.08em', fontSize: '0.6875rem' }}
            >
              Quill
            </span>
          </div>
        </div>

        {/* Tagline */}
        <p
          className="text-[#5C5C5C] text-center text-sm leading-relaxed"
          style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif' }}
        >
          Brand content, at scale.
        </p>

        {/* Card */}
        <div
          className="w-full rounded-[var(--radius-xl)] border border-[#333333] bg-[#232323] p-8 flex flex-col gap-6"
          style={{ boxShadow: '0 20px 60px 0 rgb(0 0 0 / 0.40), 0 8px 16px -4px rgb(0 0 0 / 0.24)' }}
        >
          {/* Error banner */}
          {errorMessage && (
            <div
              className="rounded-[var(--radius-md)] border border-[#4F46E5]/30 bg-[#4F46E5]/10 px-4 py-3 text-sm text-[#FF907A]"
              style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif' }}
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {/* Heading */}
          <div className="flex flex-col gap-1">
            <h1
              className="text-[#F2F2F2] leading-snug"
              style={{ fontFamily: '"PP Fragment", Georgia, serif', fontSize: '1.25rem' }}
            >
              Sign in
            </h1>
            <p
              className="text-[#858585] text-sm"
              style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif' }}
            >
              Use your corporate Google account to continue.
            </p>
          </div>

          {/* Google sign-in form */}
          <form action={signInWithGoogle}>
            <input type="hidden" name="redirectTo" value={params.redirectTo ?? ''} />
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[#5C5C5C] bg-[#2E2E2E] px-4 py-3 text-sm font-medium text-[#F2F2F2] transition-all duration-150 hover:bg-[#383838] hover:border-[#858585] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2 focus-visible:ring-offset-[#232323] active:scale-[0.99] cursor-pointer"
              style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif' }}
            >
              {/* Google logo SVG */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-5 h-5 shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          </form>

          {/* Domain restriction note */}
          <p
            className="text-center text-[#5C5C5C]"
            style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif', fontSize: '0.75rem' }}
          >
            Only for{' '}
            <span className="text-[#858585] font-medium">@example.com</span> accounts
          </p>
        </div>
      </div>

      {/* Footer */}
      <p
        className="relative z-10 mt-12 text-[#333333]"
        style={{ fontFamily: 'Aeonik, Inter, system-ui, sans-serif', fontSize: '0.6875rem' }}
      >
        &copy; {new Date().getFullYear()} Quill
      </p>
    </div>
  )
}
