/**
 * App Registry — single source of truth for all apps on the Transformotion
 * platform. Drives Launchpad tile rendering and sidebar nav population.
 *
 * `groups` lists the Cognito groups that grant access to this app.
 * The special group 'admin' grants access to every app and is checked
 * separately in `getAccessibleApps` — it doesn't need to be listed here.
 *
 * Matches Section 7 (App Registry) of DEVELOPMENT_PLAN.md.
 */

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  /** Root route for this app — React Router path prefix. */
  route: string;
  /** Cognito groups (other than 'admin') that grant access. */
  groups: string[];
  /** Emoji or SVG string used as the tile icon. */
  icon: string;
  /** CSS colour value for the tile accent ring and icon background. */
  accentColor: string;
  /** Phase when this app will be fully built. Tiles show a badge until then. */
  phase: number;
}

export const APP_REGISTRY: AppDefinition[] = [
  {
    id:           'stock-analyser',
    name:         'Stock Signal Analyser',
    description:  'Cycle position analysis across ASX, NASDAQ, Dow Jones, and FTSE. Import your CMC Markets portfolio and get buy/sell signals.',
    route:        '/stock',
    groups:       ['stock-app'],
    icon:         '📈',
    accentColor:  'var(--color-accent)',   // #4d9fff blue
    phase:        3,
  },
  {
    id:           'budget-tracker',
    name:         'Budget Tracker',
    description:  'Track income, expenses, and savings goals across accounts. Shared budgets for households and families.',
    route:        '/budget',
    groups:       ['budget-app'],
    icon:         '💰',
    accentColor:  'var(--color-success)',  // #22c87a green
    phase:        5,
  },
  {
    id:           'transformotion-framework',
    name:         'Transformotion Framework',
    description:  'Business transformation tools, templates, and playbooks.',
    route:        '/framework',
    groups:       ['transformotion'],
    icon:         '🚀',
    accentColor:  '#a855f7',              // purple
    phase:        6,
  },
];

/**
 * Returns the subset of apps the user can access, given their Cognito groups.
 * admin group → all apps; otherwise filtered by group membership.
 */
export function getAccessibleApps(userGroups: string[]): AppDefinition[] {
  if (userGroups.includes('admin')) return APP_REGISTRY;
  return APP_REGISTRY.filter((app) =>
    app.groups.some((g) => userGroups.includes(g)),
  );
}
