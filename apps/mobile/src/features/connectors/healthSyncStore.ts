import { secureStorage } from '@/lib/secure-storage';
import type { HealthTypeKey } from './healthSource';
import type { AnchorStore, SyncReport } from './healthSyncEngine';

/**
 * Ancres, date du dernier complet et dernier rapport de synchro — sur le
 * téléphone, par compte : deux comptes sur un même iPhone ne se mélangent pas.
 * Les clés ne contiennent que des caractères admis par SecureStore
 * (alphanumériques, « . », « - », « _ »).
 */
const anchorKey = (userId: string, type: HealthTypeKey): string => `supotsu.healthkit.anchor.${userId}.${type}`;
const lastFullKey = (userId: string): string => `supotsu.healthkit.lastFull.${userId}`;
const reportKey = (userId: string): string => `supotsu.healthkit.lastReport.${userId}`;

export function createAnchorStore(userId: string, types: readonly HealthTypeKey[]): AnchorStore {
  return {
    get: (type) => secureStorage.getItem(anchorKey(userId, type)),
    set: (type, anchor) => secureStorage.setItem(anchorKey(userId, type), anchor),
    async clear() {
      for (const t of types) await secureStorage.removeItem(anchorKey(userId, t));
      await secureStorage.removeItem(lastFullKey(userId));
    },
    async lastFullAt() {
      const raw = await secureStorage.getItem(lastFullKey(userId));
      return raw ? new Date(raw) : null;
    },
    setLastFullAt: (at) => secureStorage.setItem(lastFullKey(userId), at.toISOString()),
  };
}

export async function saveSyncReport(userId: string, report: SyncReport): Promise<void> {
  await secureStorage.setItem(reportKey(userId), JSON.stringify(report));
}

export async function loadSyncReport(userId: string): Promise<SyncReport | null> {
  const raw = await secureStorage.getItem(reportKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncReport;
  } catch {
    return null;
  }
}
