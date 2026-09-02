import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'brand.created'
  | 'brand.updated'
  | 'brand.deleted'
  | 'brand.member.added'
  | 'brand.member.removed'
  | 'document.uploaded'
  | 'document.ingested'
  | 'document.deleted'
  | 'article.created'
  | 'article.updated'
  | 'article.generated'
  | 'article.exported'
  | 'article.deleted'
  | 'article.status_changed'
  | 'schedule.created'
  | 'schedule.updated'
  | 'schedule.deleted'
  | 'admin.role_changed'
  | 'admin.key_updated'

export interface AuditEntry {
  actorId?: string
  action: AuditAction
  resourceType: string
  resourceId?: string
  brandId?: string
  metadata?: Record<string, unknown>
}

/**
 * Appends to the append-only app.audit_log via the service role (the table
 * grants no INSERT to `authenticated`).
 *
 * Audit failures must never fail the action being audited.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = getSupabaseAdminClient()
    const { error } = await admin.from('audit_log').insert({
      actor_id: entry.actorId ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      brand_id: entry.brandId ?? null,
      metadata: entry.metadata ?? {},
    })
    if (error) console.error('[audit] Failed to write audit log:', error.message)
  } catch (error) {
    console.error('[audit] Failed to write audit log:', error)
  }
}
