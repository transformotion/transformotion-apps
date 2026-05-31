import { selectProvider, normaliseCrossAppUrl } from '@transformotion/runtime-config'

interface AuthConfig {
  provider: 'mock' | 'cognito'
}

interface DataConfig {
  provider: 'local' | 'dynamo'
}

interface AppsConfig {
  budgetTrackerUrl: string
  // future: stockAnalyserUrl when stock-analyser moves off root in M7
}

interface ControlPlaneConfig {
  apiUrl: string
}

interface AppConfig {
  auth: AuthConfig
  data: DataConfig
  apps: AppsConfig
  controlPlane: ControlPlaneConfig
}

let cachedConfig: AppConfig | undefined

function loadConfig(): AppConfig {
  return {
    auth: {
      provider: selectProvider({
        override: process.env.NEXT_PUBLIC_AUTH_OVERRIDE,
        profileDefaults: { mock: 'mock', live: 'cognito' },
        validValues: ['mock', 'cognito'] as const,
      }),
    },
    data: {
      provider: selectProvider({
        override: process.env.NEXT_PUBLIC_DATA_OVERRIDE,
        profileDefaults: { mock: 'local', live: 'dynamo' },
        validValues: ['local', 'dynamo'] as const,
      }),
    },
    apps: {
      budgetTrackerUrl: normaliseCrossAppUrl(
        process.env.NEXT_PUBLIC_BUDGET_URL,
        '/budget-tracker/'
      ),
    },
    controlPlane: {
      apiUrl: process.env.NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL ?? '',
    },
  }
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig()
  }
  return cachedConfig
}
