import type { ComponentType } from 'react';
import { StockIcon }     from '../components/icons/StockIcon';
import { BudgetIcon }    from '../components/icons/BudgetIcon';
import { FrameworkIcon } from '../components/icons/FrameworkIcon';

/**
 * App Registry — single source of truth for all apps on the platform.
 * Drives Launchpad tile rendering, sidebar nav, and AppShell tab lists.
 *
 * Matches Section 7 (App Registry) of DEVELOPMENT_PLAN.md.
 */

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  /** Root route — React Router path prefix. */
  route: string;
  /** Cognito groups (other than 'admin') that grant access. */
  groups: string[];
  /** SVG icon component rendered on tiles and nav. */
  Icon: ComponentType<{ size?: number }>;
  /** CSS colour value for tile accent ring and icon tint. */
  accentColor: string;
  /** Phase when this app will be fully built. Tiles show a badge until then. */
  phase: number;
}

export const APP_REGISTRY: AppDefinition[] = [
  {
    id:          'stock-analyser',
    name:        'Stock Signal Analyser',
    description: 'Cycle position analysis across ASX, NASDAQ, Dow Jones, and FTSE. Import your CMC Markets portfolio and get buy/sell signals.',
    route:       '/stock',
    groups:      ['stock-app'],
    Icon:        StockIcon,
    accentColor: '#00C4B3',   // teal
    phase:       3,
  },
  {
    id:          'budget-tracker',
    name:        'Budget Tracker',
    description: 'Track income, expenses, and savings goals across accounts. Shared budgets for households and families.',
    route:       '/budget',
    groups:      ['budget-app'],
    Icon:        BudgetIcon,
    accentColor: '#E8A838',   // gold
    phase:       5,
  },
  {
    id:          'transformotion-framework',
    name:        'Transformotion Framework',
    description: 'Business transformation tools, templates, and playbooks.',
    route:       '/framework',
    groups:      ['transformotion'],
    Icon:        FrameworkIcon,
    accentColor: '#7BAAC8',   // steel
    phase:       6,
  },
];

/**
 * Returns apps accessible to the user based on their Cognito groups.
 * admin → all apps; otherwise filtered by group membership.
 */
export function getAccessibleApps(userGroups: string[]): AppDefinition[] {
  if (userGroups.includes('admin')) return APP_REGISTRY;
  return APP_REGISTRY.filter((app) =>
    app.groups.some((g) => userGroups.includes(g)),
  );
}
