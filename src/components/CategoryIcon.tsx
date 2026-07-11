import {
  Briefcase,
  Building2,
  Car,
  Dumbbell,
  Factory,
  Package,
  PawPrint,
  Shirt,
  Smartphone,
  Sofa,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  car: Car,
  building: Building2,
  smartphone: Smartphone,
  sofa: Sofa,
  shirt: Shirt,
  paw: PawPrint,
  dumbbell: Dumbbell,
  wrench: Wrench,
  factory: Factory,
  briefcase: Briefcase,
  package: Package,
};

export function CategoryIcon({
  name,
  className,
  strokeWidth,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICONS[name] ?? Package;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
