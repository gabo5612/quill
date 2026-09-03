import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Building2, Clock, Plus } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Dashboard',
}

async function getDashboardData() {
  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profile
  type ProfileRow = { id: string; name: string; global_role: 'admin' | 'editor' | 'viewer' }
  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('id, name, global_role')
    .eq('id', user.id)
    .single()
  const profile = rawProfile as ProfileRow | null

  // Brand memberships count
  type MembershipRow = { brand_id: string; brands: { status: string } | null }
  const { data: rawMemberships } = await supabase
    .from('brand_members')
    .select('brand_id, brands(status)')
    .eq('user_id', user.id)

  const memberships = (rawMemberships ?? []) as unknown as MembershipRow[]

  const activeBrands = memberships.filter(
    m => m.brands?.status === 'active'
  ).length

  // Articles this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const brandIds = memberships.map(m => m.brand_id)

  let totalThisMonth = 0
  let scheduledCount = 0
  let recentArticles: Array<{
    id: string
    status: 'draft' | 'in_review' | 'approved' | 'exported'
    objective: string | null
    created_at: string
    brand_id: string
  }> = []

  if (brandIds.length > 0) {
    const { count: monthCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .in('brand_id', brandIds)
      .gte('created_at', startOfMonth.toISOString())

    totalThisMonth = monthCount ?? 0

    const { count: schCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .in('brand_id', brandIds)
      .in('status', ['draft', 'in_review'])

    scheduledCount = schCount ?? 0

    const { data: recent } = await supabase
      .from('articles')
      .select('id, status, objective, created_at, brand_id')
      .in('brand_id', brandIds)
      .order('created_at', { ascending: false })
      .limit(5)

    recentArticles = (recent ?? []) as typeof recentArticles
  }

  return {
    profile,
    activeBrands,
    totalThisMonth,
    scheduledCount,
    recentArticles,
  }
}

function greeting(name: string) {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${name}!`
  if (hour < 18) return `Good afternoon, ${name}!`
  return `Good evening, ${name}!`
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-card flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)]">
        <Icon size={18} className="text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-caption text-[var(--text-muted)] uppercase tracking-wide font-medium">
          {label}
        </p>
        <p className="text-heading-m font-fragment text-[var(--text)] mt-0.5">
          {value}
        </p>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export default async function DashboardPage() {
  const { profile, activeBrands, totalThisMonth, scheduledCount, recentArticles } =
    await getDashboardData()

  const name = profile?.name?.trim() || 'team'

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-l font-fragment text-[var(--text)]">
            {greeting(name)}
          </h1>
          <p className="mt-1 text-small text-[var(--text-muted)]">
            Here&apos;s a summary of your editorial activity.
          </p>
        </div>
        <Button asChild variant="primary" size="md" icon={<Plus size={15} />}>
          <Link href="/articles/new">Generate article</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Articles this month"
          value={totalThisMonth}
          icon={FileText}
        />
        <StatCard
          label="Active brands"
          value={activeBrands}
          icon={Building2}
        />
        <StatCard
          label="In queue"
          value={scheduledCount}
          icon={Clock}
        />
      </div>

      {/* Recent articles */}
      <div>
        <h2 className="text-heading-s font-fragment text-[var(--text)] mb-4">
          Recent articles
        </h2>

        {recentArticles.length === 0 ? (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center shadow-card">
            <FileText size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-small text-[var(--text-muted)]">
              No articles yet. Generate your first one.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <Link href="/articles/new">Generate article</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-card overflow-hidden">
            <ul className="divide-y divide-[var(--border)]">
              {recentArticles.map(article => (
                <li key={article.id}>
                  <Link
                    href={`/articles/${article.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--surface-raised)] transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-small font-medium text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                        {article.objective ?? `Untitled article`}
                      </p>
                      <p className="mt-0.5 text-caption text-[var(--text-muted)]">
                        {formatDate(article.created_at)}
                      </p>
                    </div>
                    <Badge
                      status={article.status}
                      size="sm"
                    />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="border-t border-[var(--border)] px-5 py-3">
              <Link
                href="/articles"
                className="text-small text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors font-medium"
              >
                View all articles →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
