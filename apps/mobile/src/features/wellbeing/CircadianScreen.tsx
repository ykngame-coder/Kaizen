import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeCircadianProfile, type Chronotype } from '@supotsu/engines';
import { useHealthMetrics } from '@/lib/data/queries';

const CHRONOTYPE_TONE: Record<Chronotype, 'info' | 'success' | 'warning'> = {
  précoce: 'info',
  intermédiaire: 'success',
  tardif: 'warning',
};

const CHRONOTYPE_HINT: Record<Chronotype, string> = {
  précoce: 'Tu es plutôt du matin : énergie tôt, coup de barre en soirée.',
  intermédiaire: 'Rythme équilibré : tu t’adaptes bien matin comme soir.',
  tardif: 'Tu es plutôt du soir : démarrage lent, pic d’énergie tardif.',
};

/**
 * Circadian Engine screen (Sleep Suite §3.2). Derives the user's chronotype and
 * optimal timing from sleep history, in local time. Every figure is explained;
 * recommendations are guidance, not medical advice.
 */
export function CircadianScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: metrics = [], isLoading } = useHealthMetrics();
  const asOf = new Date().toISOString();
  // getTimezoneOffset() is minutes to add to local to reach UTC (negative east);
  // negate it to get "minutes to add to UTC to reach local".
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  const result = useMemo(
    () => computeCircadianProfile(metrics, asOf, { tzOffsetMinutes }),
    [metrics, asOf, tzOffsetMinutes],
  );
  const profile = result.value;
  const explanation = result.explanation;

  return (
    <Screen scroll>
      <Text variant="title">Rythme circadien</Text>
      <Text variant="caption" color="textMuted">
        Ton chronotype et tes horaires optimaux, déduits de tes nuits — des repères, pas des
        prescriptions médicales.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : !profile ? (
        <EmptyState
          icon="🌙"
          title="Encore un peu de patience"
          message="Il faut au moins 4 nuits enregistrées pour établir ton rythme. Continue à synchroniser tes données."
          actionLabel="Importer / connecter"
          onAction={() => router.push('/import')}
        />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="heading">Chronotype</Text>
              <Badge label={profile.chronotype} tone={CHRONOTYPE_TONE[profile.chronotype]} />
            </View>
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
              {CHRONOTYPE_HINT[profile.chronotype]}
            </Text>
          </Card>

          <Card>
            <Text variant="heading">Ta fenêtre de sommeil</Text>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[2] }}
            >
              <View>
                <Text variant="caption" color="textSubtle">
                  Habituelle
                </Text>
                <Text variant="subtitle">
                  {profile.habitualBedtime} → {profile.habitualWake}
                </Text>
              </View>
              <View>
                <Text variant="caption" color="textSubtle">
                  Idéale (8 h)
                </Text>
                <Text variant="subtitle" color="primary">
                  {profile.idealBedtime} → {profile.idealWake}
                </Text>
              </View>
            </View>
            {profile.socialJetlagMin !== null && (
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2] }}>
                Décalage social (semaine vs week-end) : {profile.socialJetlagMin} min
                {profile.socialJetlagMin >= 60
                  ? ' — un vrai « jet lag » à réduire pour un réveil plus facile.'
                  : ' — bien maîtrisé.'}
              </Text>
            )}
          </Card>

          <Card>
            <Text variant="heading">Tes horaires optimaux</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
              {profile.recommendations.map((r) => (
                <View key={r.key} style={{ gap: spacing[1] }}>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                  >
                    <Text variant="body">{r.label}</Text>
                    <Text variant="subtitle" color="primary">
                      {r.value}
                    </Text>
                  </View>
                  <Text variant="caption" color="textSubtle">
                    {r.detail}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {explanation && (
            <Card>
              <Text variant="heading">En résumé</Text>
              <Text variant="caption" color="textMuted">
                {explanation.observation}
              </Text>
              <Text variant="caption" color="textMuted">
                {explanation.analysis}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1], color: colors.text }}>
                {explanation.action}
              </Text>
            </Card>
          )}
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
