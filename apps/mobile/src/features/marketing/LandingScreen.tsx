import React from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import appIcon from '../../../assets/icon.png';

const FEATURES = [
  'Sommeil, fréquence cardiaque, HRV, poids — synchronisés depuis Apple Santé, Garmin ou Strava.',
  'Des scores expliqués (récupération, charge, progression), jamais un chiffre opaque.',
  'Entraînement, nutrition et habitudes réunis au même endroit.',
];

/** Page d'accueil web (kaizensupotsu.uk) pour un visiteur non connecté — pas la même chose que l'app native, qui va droit à l'écran de connexion. */
export function LandingScreen(): React.JSX.Element {
  const router = useRouter();

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

      <View style={{ marginTop: spacing[8], gap: spacing[3] }}>
        {FEATURES.map((f) => (
          <View
            key={f}
            style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}
          >
            <Text variant="body">•</Text>
            <Text variant="body" color="textMuted" style={{ flex: 1, lineHeight: 21 }}>{f}</Text>
          </View>
        ))}
      </View>

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
