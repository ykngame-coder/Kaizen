import React from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

const SUPPORT_EMAIL = 'support@kaizensupotsu.uk';

/** Page de contact publique — reachable while signed out (App Store Connect "Support URL"). */
export function ContactScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <Screen scroll>
      <Text variant="title">Contact & support</Text>
      <Text variant="caption" color="textSubtle">Kaizen Supotsu</Text>

      <View style={{ marginTop: spacing[5], gap: spacing[3] }}>
        <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>
          Une question, un bug à signaler, ou besoin d'aide avec l'app ? Écris-nous, on te répond
          directement.
        </Text>
        <Text variant="body" style={{ fontWeight: '700' }}>{SUPPORT_EMAIL}</Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label="Envoyer un e-mail"
            onPress={() => {
              void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] }}>
        <Button label="Politique de confidentialité" variant="secondary" onPress={() => router.push('/privacy')} />
        <Button label="Conditions d'utilisation" variant="secondary" onPress={() => router.push('/terms')} />
      </View>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[5] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
