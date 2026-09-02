import { redirect } from 'next/navigation'
import { AppShell } from '@/components/ui/app-shell'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type Profile = {
  id: string
  name: string
  email: string
  global_role: 'admin' | 'editor' | 'viewer'
}

type BrandEntry = {
  brand_id: string
  brand_role: 'owner' | 'editor' | 'viewer'
  brands: {
    id: string
    name: string
    slug: string
    logo_url: string | null
    status: 'active' | 'archived'
  } | null
}

async function getLayoutData() {
  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: rawProfile }, { data: rawBrands }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email, global_role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('brand_members')
      .select('brand_id, brand_role, brands(id, name, slug, logo_url, status)')
      .eq('user_id', user.id),
  ])

  const profile = rawProfile as unknown as Profile | null

  // The profile row is created by the app.handle_new_user trigger. If it is
  // missing the account is in a broken state — sign out rather than render a
  // shell with no identity.
  if (!profile) return null

  return {
    profile,
    brands: (rawBrands ?? []) as unknown as BrandEntry[],
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const data = await getLayoutData()

  if (!data) redirect('/login')

  return (
    <AppShell profile={data.profile} brands={data.brands}>
      {children}
    </AppShell>
  )
}
