import type { Connector, ConnectorCapability, ConnectorProvider } from './types';
import { demoConnector } from './demoConnector';

/** Catalog entry for the "Mes appareils" screen (Master Prompt P9.13, P22.14). */
export interface ConnectorInfo {
  provider: ConnectorProvider;
  name: string;
  available: boolean;
  capabilities: ConnectorCapability[];
}

/**
 * Provider catalog. Real connectors are listed as "à venir" (available:false)
 * until wired with native SDKs / OAuth; the demo connector is functional now.
 */
export const CONNECTORS: ConnectorInfo[] = [
  {
    provider: 'demo',
    name: 'Appareil de démonstration',
    available: true,
    capabilities: ['activities', 'health'],
  },
  {
    provider: 'apple_health',
    name: 'Apple Santé',
    available: false,
    capabilities: ['activities', 'health'],
  },
  {
    provider: 'garmin',
    name: 'Garmin Connect',
    available: false,
    capabilities: ['activities', 'health'],
  },
  { provider: 'strava', name: 'Strava', available: false, capabilities: ['activities'] },
  { provider: 'oura', name: 'Oura', available: false, capabilities: ['health'] },
  { provider: 'withings', name: 'Withings', available: false, capabilities: ['health'] },
];

/** Resolve a runnable connector, or null if the provider isn't wired yet. */
export function getConnector(provider: ConnectorProvider): Connector | null {
  if (provider === 'demo') return demoConnector;
  return null;
}
