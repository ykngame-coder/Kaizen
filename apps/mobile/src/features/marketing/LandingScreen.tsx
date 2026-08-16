import React from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import appIcon from '../../../assets/icon.png';
import screenshotDashboard from '../../../assets/marketing/dashboard.png';
import screenshotSport from '../../../assets/marketing/sport.png';
import screenshotSommeil from '../../../assets/marketing/sommeil.png';
import screenshotNutrition from '../../../assets/marketing/nutrition.png';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: '📊',
    title: 'Score Kaizen',
    description:
      "Un score quotidien qui combine récupération, sommeil, charge d'entraînement et régularité — jamais un chiffre opaque : chaque composante est expliquée séparément.",
  },
  {
    icon: '🏋️',
    title: 'Sport',
    description:
      "Bibliothèque de plus de 800 exercices, programmes personnalisés, suivi de charge d'entraînement, et une carte de récupération musculaire qui montre quels muscles sont prêts à retravailler.",
  },
  {
    icon: '😴',
    title: 'Sommeil',
    description:
      'Phases de sommeil, HRV, fréquence cardiaque de repos, stimulation bilatérale, méditation guidée et sons apaisants pour mieux comprendre et améliorer tes nuits.',
  },
  {
    icon: '🍽',
    title: 'Nutrition',
    description:
      "Journal alimentaire avec scan de code-barres, objectifs caloriques et macronutriments personnalisés selon ton profil et ton objectif.",
  },
  {
    icon: '✦',
    title: 'Coach IA',
    description:
      "Des recommandations concrètes et expliquées, générées à partir de tes propres données — pas de conseils génériques.",
  },
  {
    icon: '🔗',
    title: 'Connecté à ce que tu utilises déjà',
    description: 'Apple Santé, Garmin et Strava synchronisent automatiquement tes données existantes.',
  },
];

const SCREENSHOTS: { source: number; caption: string }[] = [
  { source: screenshotDashboard, caption: 'Accueil — Score Kaizen' },
  { source: screenshotSport, caption: 'Sport — Récupération musculaire' },
  { source: screenshotSommeil, caption: 'Sommeil' },
  { source: screenshotNutrition, caption: 'Nutrition' },
];

function FeatureRow({ icon, title, description }: Feature): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'flex-start' }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.lg,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ fontWeight: '700' }}>{title}</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2, lineHeight: 19 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}

/** Page d'accueil web (kaizensupotsu.uk) pour un visiteur non connecté — pas la même chose que l'app native, qui va droit à l'écran de connexion. */
export function LandingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', gap: spacing[3], marginTop: spacing[8] }}>
        <Image source={appIcon} style={{ width: 88, height: 88, borderRadius: 22 }} />
        <Text variant="display" style={{ textAlign: 'center' }}>Kaizen Supotsu</Text>
        <Text variant="body" color="textSubtle" style={{ textAlign: 'center' }}>
          Progresser aujourd'hui, être meilleur demain.
        </Text>
        <Badge label="Bêta privée · Test TestFlight en cours" tone="warning" />
      </View>

      <Text
        variant="body"
        color="textMuted"
        style={{ textAlign: 'center', marginTop: spacing[6], lineHeight: 22, maxWidth: 480, alignSelf: 'center' }}
      >
        Kaizen Supotsu centralise tes données de sport, sommeil et nutrition — depuis Apple Santé, Garmin,
        Strava ou saisies à la main — et t'aide à comprendre ta forme au lieu de te noyer sous les chiffres.
      </Text>

      <View style={{ marginTop: spacing[8], gap: spacing[5] }}>
        {FEATURES.map((f) => (
          <FeatureRow key={f.title} {...f} />
        ))}
      </View>

      {SCREENSHOTS.length > 0 ? (
        <View style={{ marginTop: spacing[8] }}>
          <Text variant="heading" style={{ textAlign: 'center', marginBottom: spacing[4] }}>
            Aperçu de l'app
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[4], paddingHorizontal: spacing[2] }}>
            {SCREENSHOTS.map((s) => (
              <View key={s.caption} style={{ alignItems: 'center', gap: spacing[2] }}>
                <Image
                  source={s.source}
                  style={{ width: 220, height: 476, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border }}
                  resizeMode="cover"
                />
                <Text variant="caption" color="textSubtle">{s.caption}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ alignItems: 'center', marginTop: spacing[8], gap: spacing[3] }}>
        <Button label="Se connecter" onPress={() => router.push('/(auth)/sign-in')} />
        <Text variant="caption" color="textSubtle" style={{ textAlign: 'center' }}>
          Application actuellement testée en privé avant sa sortie publique sur l'App Store.
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: spacing[4],
          marginTop: spacing[8],
          marginBottom: spacing[6],
        }}
      >
        <Text variant="caption" color="primary" onPress={() => router.push('/privacy')}>
          Politique de confidentialité
        </Text>
        <Text variant="caption" color="primary" onPress={() => router.push('/terms')}>
          Conditions d'utilisation
        </Text>
        <Text variant="caption" color="primary" onPress={() => router.push('/support')}>
          Contact & support
        </Text>
      </View>
    </Screen>
  );
}
