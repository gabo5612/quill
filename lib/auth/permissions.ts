export type GlobalRole = 'admin' | 'editor' | 'viewer'
export type BrandRole = 'owner' | 'editor' | 'viewer'

export type Permission =
  | 'content.generate'
  | 'content.edit'
  | 'content.read'
  | 'brand.manage'    // create/edit/delete brands
  | 'brand.read'
  | 'audit.read'
  | 'users.manage'
  | 'keys.manage'
  | 'admin.access'

// Global role permissions
const GLOBAL_PERMISSIONS: Record<GlobalRole, Permission[]> = {
  admin: ['content.generate','content.edit','content.read','brand.manage','brand.read','audit.read','users.manage','keys.manage','admin.access'],
  editor: ['content.generate','content.edit','content.read','brand.read'],
  viewer: ['content.read','brand.read'],
}

// Brand role permissions (supplement global; checked when scoped to a brand)
const BRAND_PERMISSIONS: Record<BrandRole, Permission[]> = {
  owner: ['content.generate','content.edit','content.read','brand.manage','brand.read'],
  editor: ['content.generate','content.edit','content.read','brand.read'],
  viewer: ['content.read','brand.read'],
}

export function hasPermission(
  globalRole: GlobalRole,
  permission: Permission,
  brandRole?: BrandRole
): boolean {
  if (GLOBAL_PERMISSIONS[globalRole].includes(permission)) return true
  if (brandRole && BRAND_PERMISSIONS[brandRole].includes(permission)) return true
  return false
}

export function getGlobalPermissions(role: GlobalRole): Permission[] {
  return GLOBAL_PERMISSIONS[role]
}
