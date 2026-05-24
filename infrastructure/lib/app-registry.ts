import * as fs   from 'fs';
import * as path from 'path';

export interface AppDescriptor {
  slug:             string;
  displayName:      string;
  description:      string;
  urlPrefix:        string;
  cognitoGroup:     string;
  groupDescription: string;
  iconKey:          string;
  colourToken:      string;
}

export interface AppRegistry {
  apps: AppDescriptor[];
}

/**
 * Read and parse platform/config/app-registry.json at CDK synth time.
 * The path is resolved relative to this file, so it works regardless of
 * the caller's __dirname.
 */
export function loadAppRegistry(): AppRegistry {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../platform/config/app-registry.json'), 'utf-8'),
  ) as AppRegistry;
}
