import { describe, expect, it } from 'vitest';
import { ROLES } from '../../src/shared/constants';
import { can, PERMISSIONS, type Permission } from '../../src/shared/permissions';

const expected: Record<Permission, string[]> = {
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
};

describe('permissions', () => {
  it('matches the documented role matrix exactly', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(expected).sort());
    for (const [perm, roles] of Object.entries(expected)) {
      for (const role of ROLES) expect(can(role, perm as Permission), `${role} ${perm}`).toBe(roles.includes(role));
    }
  });
  it('denies when there is no role', () => {
    expect(can(undefined, 'asset.view')).toBe(false);
  });
});
