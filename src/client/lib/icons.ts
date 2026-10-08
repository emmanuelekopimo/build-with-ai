import { Cable, Keyboard, Laptop, Monitor, Mouse, Projector, Smartphone, Tablet, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  laptop: Laptop,
  monitor: Monitor,
  smartphone: Smartphone,
  tablet: Tablet,
  projector: Projector,
  mouse: Mouse,
  keyboard: Keyboard,
  cable: Cable,
};

export const categoryIcon = (name?: string | null): LucideIcon => (name && ICONS[name]) || Laptop;
