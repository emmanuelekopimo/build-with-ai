// Role → permission map (docs/DECISIONS.md D31–D33). Enforced server-side by
// `requirePermission`; the client uses the same map only to hide or disable controls.

import type { Role } from './constants';
import type { AssetAction } from './statusMachine';

export const PERMISSIONS = {
  'dashboard.view': ['IT_ADMIN', 'IT_SUPPORT', 'VIEWER'],
  'asset.view': ['IT_ADMIN', 'IT_SUPPORT', 'VIEWER'],
  'asset.reportDamage': ['IT_ADMIN', 'IT_SUPPORT'],
  'asset.retire': ['IT_ADMIN'],
  'asset.reinstate': ['IT_ADMIN'],
  'asset.delete': ['IT_ADMIN'],
  'asset.viewDeleted': ['IT_ADMIN'],
  'intake.manage': ['IT_ADMIN', 'IT_SUPPORT'],
  'form.manage': ['IT_ADMIN', 'IT_SUPPORT'],
  'signoff.view': ['IT_ADMIN', 'IT_SUPPORT'],
  'people.view': ['IT_ADMIN', 'IT_SUPPORT'],
  'report.view': ['IT_ADMIN', 'IT_SUPPORT', 'VIEWER'],
  'report.exportSingle': ['IT_ADMIN', 'IT_SUPPORT'],
  'report.exportBulk': ['IT_ADMIN'],
  'user.manage': ['IT_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ACTION_PERMISSION: Record<AssetAction, Permission> = {
  ISSUE: 'form.manage',
  RETURN: 'form.manage',
  SEND_FOR_REPAIR: 'form.manage',
  RECEIVE_BACK: 'form.manage',
  REPORT_DAMAGE: 'asset.reportDamage',
  RETIRE: 'asset.retire',
  REPAIR: 'asset.reinstate',
  DELETE: 'asset.delete',
};

/** Human message for a 403 on each permission. */
export const PERMISSION_MESSAGE: Partial<Record<Permission, string>> = {
  'asset.retire': 'Only IT Admin can retire assets.',
  'asset.reinstate': 'Only IT Admin can reinstate retired assets for repair.',
  'asset.delete': 'Only IT Admin can delete assets.',
  'report.exportBulk': 'Only IT Admin can download bulk exports.',
  'user.manage': 'Only IT Admin can manage users.',
};
