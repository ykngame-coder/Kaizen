import type {
  HKQuantitySample,
  HKSleepSample,
  HKWorkout,
  ImportedActivity,
  ImportedHealthMetric,
  ImportedSleepSession,
  TimeInterval,
} from '@supotsu/connectors';

/**
 * Apple Santé tel que le voit l'orchestrateur de synchro. Une interface plutôt
 * qu'un appel direct au module natif : c'est ce qui permet de tester la logique
 * d'ancres contre un faux — le build local ne fonctionne pas, et une erreur ici
 * peut perdre des données sans rien dire.
 *
 * Implémentation réelle : `nativeHealthSource` dans `healthKitClient.ios.ts`.
 */

/** Les mesures ponctuelles lues (voir `QUANTITY_TYPES`). */
export type PointMetricKey =
  | 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
  | 'HKQuantityTypeIdentifierRestingHeartRate'
  | 'HKQuantityTypeIdentifierBodyMass'
  | 'HKQuantityTypeIdentifierBodyFatPercentage'
  | 'HKQuantityTypeIdentifierLeanBodyMass';

/** Un type suivi par ancre — une ancre par type. */
export type HealthTypeKey = 'workouts' | 'sleep' | 'steps' | PointMetricKey;

/** Ce que Santé signale comme ajouté, sous la forme utile à chaque type. */
export type Added =
  | { kind: 'workouts'; workouts: HKWorkout[] }
  | { kind: 'sleep'; samples: HKSleepSample[] }
  | { kind: 'steps'; intervals: TimeInterval[] }
  | { kind: 'quantity'; samples: HKQuantitySample[] };

export interface ChangeSet {
  added: Added;
  /** Identifiants des échantillons supprimés — sans leur date. */
  deletedUuids: string[];
  newAnchor: string;
}

export interface FullRead {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
  sleepSessions: ImportedSleepSession[];
}

export interface HealthSource {
  readonly types: readonly HealthTypeKey[];
  authorize(): Promise<void>;
  /**
   * La position courante de Santé pour ce type, sans télécharger l'historique.
   * `via` dit comment elle a été obtenue — affiché dans le diagnostic.
   */
  currentAnchor(type: HealthTypeKey): Promise<{ anchor: string; via: 'empty-query' | 'paged' } | null>;
  changesSince(type: HealthTypeKey, anchor: string): Promise<ChangeSet>;
  /** Échantillons de sommeil chevauchant [from, to). */
  readSleep(from: Date, to: Date): Promise<HKSleepSample[]>;
  /** Totaux de pas par jour local sur [from, to), datés de midi. */
  stepTotals(from: Date, to: Date): Promise<ImportedHealthMetric[]>;
  readQuantity(type: PointMetricKey, from: Date, to: Date): Promise<HKQuantitySample[]>;
  /** La relecture complète sur 3 ans. */
  fullRead(): Promise<FullRead>;
}
