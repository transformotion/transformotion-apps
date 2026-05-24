export const APP_IDENTITY = {
  slug:             'stock-analyser',
  displayName:      'Stock Signal Analyser',
  description:      'Cycle position analysis across ASX, NASDAQ, Dow Jones, FTSE',
  urlPrefix:        '/stock-analyser',
  cognitoGroup:     'stock-app-access',
} as const;

export const APP_SLUG = APP_IDENTITY.slug;
