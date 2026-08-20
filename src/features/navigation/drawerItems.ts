import {
  ArrowLeftRight,
  LayoutGrid,
  PackageCheck,
  PackagePlus,
  Settings,
  Monitor,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Single source of truth for the drawer. The drawer just maps over these arrays,
 * so adding a workflow later is one line here + one screen file — no component
 * rework. See XFLORA_PORT_PLAN.md §3.
 *
 * v1 ships the 5 reference-backed Xflora workflows, built simplest-first (§7).
 * Each item is uncommented as its screen lands. Grading / Packing / Staging are
 * v2 candidates (§6) — kept here as a template, shipped via OTA once spec'd.
 */
export interface DrawerItem {
  label: string;
  icon: LucideIcon;
  route: string;
}

export const WORKFLOW_ITEMS: DrawerItem[] = [
  { label: 'Receiving', icon: PackagePlus, route: '/receiving' },
  { label: 'Rejects', icon: XCircle, route: '/rejects' }, // = coldroom discard flow
  { label: 'Bucket Transfer', icon: ArrowLeftRight, route: '/bucket-transfer' },
  { label: 'Shelving', icon: LayoutGrid, route: '/shelving' },
  { label: 'Issuing', icon: PackageCheck, route: '/issuing' },
  // TEMPORARY — Phase 2 device-verification entry point. Delete in Phase 5.
  { label: 'UI Preview', icon: LayoutGrid, route: '/ui-preview' },
  //
  // v2 candidates (ship via OTA once spec'd against the live backend — §6):
  //   Grading → Hexagon → '/grading'
  //   Packing → Box     → '/packing'
  //   Staging → Boxes   → '/staging'
];

export const UTILITY_ITEMS: DrawerItem[] = [
  { label: 'Configure Farm', icon: Settings, route: '/configure' },
  { label: 'View ERP Desk', icon: Monitor, route: '/erp-desk' },
];
