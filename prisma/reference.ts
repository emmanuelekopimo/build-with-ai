// Reference data shared by the seed script and the integration tests.
import type { PrismaClient } from '@prisma/client';

export const PROJECTS = [
  { name: 'ACE-5 Uyo', description: 'Field project' },
  { name: 'HQ Uyo', description: 'Internal' },
  { name: 'Ikot Ekpene', description: 'Field site' },
  { name: 'Eket Office', description: 'Field site' },
  { name: 'Field Ops', description: 'Field operations' },
];

export const LOCATIONS = [
  { name: 'Uyo HQ', isStore: false },
  { name: 'Uyo HQ Store', isStore: true },
  { name: 'Ikot Ekpene office', isStore: false },
  { name: 'Eket Office - IT Store', isStore: true },
  { name: 'ACE-5 Uyo site', isStore: false },
  { name: 'Field Ops', isStore: false },
];

export const CATEGORIES = [
  { name: 'Laptop', group: 'Laptops', icon: 'laptop', requiresSerial: true, description: 'Business Laptop' },
  { name: 'Desktop', group: 'Other', icon: 'monitor', requiresSerial: true, description: 'Desktop Computer' },
  { name: 'Mobile Phone', group: 'Phones', icon: 'smartphone', requiresSerial: true, description: 'Mobile Phone' },
  { name: 'Tablet', group: 'Phones', icon: 'tablet', requiresSerial: true, description: 'Tablet' },
  { name: 'Projector', group: 'Other', icon: 'projector', requiresSerial: true, description: 'Projector' },
  { name: 'External Monitor', group: 'Monitors', icon: 'monitor', requiresSerial: true, description: 'External Monitor' },
  { name: 'Wireless Mouse', group: 'Accessories', icon: 'mouse', requiresSerial: true, description: 'Wireless Mouse' },
  { name: 'Wireless Keyboard', group: 'Accessories', icon: 'keyboard', requiresSerial: true, description: 'Wireless Keyboard' },
  { name: 'Accessories', group: 'Accessories', icon: 'cable', requiresSerial: false, description: 'Accessory' },
];

export async function upsertReferenceData(prisma: PrismaClient) {
  for (const p of PROJECTS) await prisma.project.upsert({ where: { name: p.name }, update: p, create: p });
  for (const l of LOCATIONS) await prisma.location.upsert({ where: { name: l.name }, update: l, create: l });
  for (const c of CATEGORIES) await prisma.category.upsert({ where: { name: c.name }, update: c, create: c });
}
