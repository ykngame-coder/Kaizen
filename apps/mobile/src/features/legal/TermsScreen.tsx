import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { BackButton } from '@/features/navigation/BackButton';

const SUPPORT_EMAIL = 'support@kaizensupotsu.uk';
const LAST_UPDATED = '14 août 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ marginTop: spacing[5] }}>
      <Text variant="heading">{title}</Text>
      <View style={{ marginTop: spacing[2], gap: spacing[2] }}>{children}</View>
    </View>
  );
}

function P({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>
      {children}
    </Text>
  );
}

/** Conditions d'utilisation — reachable while signed out (même route group que la politique de confidentialité). */
export function TermsScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">Conditions d'utilisation</Text>
      <Text variant="caption" color="textSubtle">Dernière mise à jour : {LAST_UPDATED}</Text>

      <Section title="Acceptation">
        <P>
          En créant un compte ou en utilisant Kaizen Supotsu, tu acceptes les présentes
          conditions. Si tu n'es pas d'accord, merci de ne pas utiliser l'app.
        </P>
      </Section>

      <Section title="Le service">
        <P>
          Kaizen Supotsu centralise tes données de sport et de santé (sommeil, fréquence
          cardiaque, activités, nutrition…) provenant de sources que tu connectes toi-même
          (Apple Santé, Garmin, Strava, saisie manuelle), et t'aide à les comprendre via des
          scores et recommandations expliqués.
        </P>
      </Section>

      <Section title="Ton compte">
        <P>
          Tu es responsable de l'exactitude des informations fournies et de la confidentialité de
          ton mot de passe. Un compte est personnel et ne doit pas être partagé.
        </P>
      </Section>

      <Section title="Utilisation acceptable">
        <P>
          Tu t'engages à ne pas utiliser l'app à des fins illégales, à ne pas tenter d'accéder aux
          données d'autres utilisateurs, et à respecter les autres membres dans les espaces
          communautaires (défis, classements).
        </P>
      </Section>

      <Section title="Ce n'est pas un avis médical">
        <P>
          Les scores, recommandations et analyses fournis par l'app sont informatifs et ne
          remplacent en aucun cas un avis médical professionnel. Consulte un professionnel de
          santé pour toute décision concernant ta santé, ton entraînement ou ton alimentation,
          en particulier en cas de condition médicale préexistante.
        </P>
      </Section>

      <Section title="Propriété intellectuelle">
        <P>
          L'app, son design et son contenu éditorial nous appartiennent. Tes propres données
          (séances, mesures, notes) t'appartiennent — tu peux les exporter à tout moment.
        </P>
      </Section>

      <Section title="Résiliation">
        <P>
          Tu peux supprimer ton compte à tout moment depuis Réglages → "Supprimer mon compte" —
          suppression immédiate et définitive de toutes tes données. Nous pouvons suspendre un
          compte en cas d'utilisation abusive avérée.
        </P>
      </Section>

      <Section title="Limitation de responsabilité">
        <P>
          L'app est fournie "en l'état". Nous faisons notre possible pour garantir la fiabilité
          des calculs et la disponibilité du service, sans garantie absolue d'exactitude ou de
          continuité de service.
        </P>
      </Section>

      <Section title="Modifications">
        <P>
          Nous pouvons modifier ces conditions ; toute modification significative te sera
          signalée dans l'app avant son entrée en vigueur.
        </P>
      </Section>

      <Section title="Droit applicable">
        <P>
          Les présentes conditions sont régies par le droit français. Tout litige relatif à leur
          interprétation ou leur exécution relève des tribunaux compétents du lieu de résidence de
          l'éditeur, sans préjudice des droits impératifs dont tu bénéficies en tant que
          consommateur.
        </P>
      </Section>

      <Section title="Contact">
        <P>{SUPPORT_EMAIL}</P>
      </Section>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[5] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
