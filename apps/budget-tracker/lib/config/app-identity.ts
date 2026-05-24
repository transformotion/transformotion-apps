export const APP_IDENTITY = {
  slug:             'budget-tracker',
  displayName:      'Budget Tracker',
  description:      'Track income, expenses and savings across accounts',
  urlPrefix:        '/budget-tracker',
  cognitoGroup:     'budget-app-access',
} as const;

export const APP_SLUG = APP_IDENTITY.slug;
