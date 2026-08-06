import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

const SUPPORT_EMAIL = 'support@kaizen-supotsu.app';
const LAST_UPDATED = '6 août 2026';

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

/** Politique de confidentialité — reachable while signed out (App Store Connect "Privacy Policy URL"). */
export function PrivacyPolicyScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <Screen scroll>
      <Text variant="title">Politique de confidentialité</Text>
      <Text variant="caption" color="textSubtle">Dernière mise à jour : {LAST_UPDATED}</Text>

      <Section title="Qui nous sommes">
        <P>
          Kaizen Supotsu ("l'app", "nous") centralise et explique tes données de santé et de sport
          — sommeil, fréquence cardiaque, variabilité cardiaque (HRV), poids, composition
          corporelle, séances d'entraînement, nutrition — pour t'aider à comprendre ta forme et ta
          progression. Cette politique décrit quelles données nous traitons, pourquoi, et comment
          tu gardes le contrôle dessus.
        </P>
      </Section>

      <Section title="Données que nous collectons">
        <P>• Compte : adresse e-mail, mot de passe (chiffré, jamais lisible par nous).</P>
        <P>
          • Données de santé : lues depuis Apple Santé (HealthKit) — sommeil et ses phases,
          fréquence cardiaque de repos, HRV, poids, masse grasse, masse musculaire — uniquement si
          tu autorises explicitement chaque catégorie depuis l'app iOS Réglages ou lors de la
          demande d'autorisation.
        </P>
        <P>
          • Activités et séances : celles que tu enregistres dans l'app, ou synchronisées depuis
          Garmin Connect / Strava si tu connectes ces comptes.
        </P>
        <P>• Nutrition : les repas et l'hydratation que tu saisis toi-même.</P>
        <P>• Photo de profil : si tu en ajoutes une, stockée de façon sécurisée et liée à ton compte.</P>
        <P>
          • Données techniques minimales nécessaires au fonctionnement (identifiant de compte,
          horodatages).
        </P>
      </Section>

      <Section title="Comment nous utilisons ces données">
        <P>
          Uniquement pour t'offrir le service : calculer tes scores (récupération, sommeil,
          charge), générer des recommandations et explications, afficher tes tendances, et faire
          fonctionner les fonctionnalités communautaires que tu choisis d'utiliser (défis,
          classements). Nous ne vendons jamais tes données à des tiers, et nous ne les utilisons
          pas à des fins publicitaires.
        </P>
      </Section>

      <Section title="Partage avec des tiers">
        <P>
          Tes données sont hébergées chez Supabase (base de données et authentification), notre
          seul sous-traitant technique. Si tu connectes Garmin, Strava ou Apple Santé, l'app
          échange des données avec ces services selon les autorisations que tu leur accordes
          directement — nous ne recevons que ce que tu as explicitement autorisé.
        </P>
      </Section>

      <Section title="Sécurité">
        <P>
          L'accès à tes données est restreint à ton compte uniquement (règles de sécurité au
          niveau des lignes de la base de données — personne d'autre, y compris un autre
          utilisateur de l'app, ne peut lire tes données). Les échanges avec nos serveurs sont
          chiffrés (HTTPS).
        </P>
      </Section>

      <Section title="Tes droits">
        <P>
          Tu peux à tout moment :
        </P>
        <P>
          • Exporter toutes tes données au format JSON, depuis Réglages → "Exporter mes données".
        </P>
        <P>
          • Supprimer définitivement ton compte et toutes les données associées, depuis Réglages →
          "Supprimer mon compte" — cette action est irréversible et immédiate.
        </P>
        <P>
          • Nous contacter à {SUPPORT_EMAIL} pour toute question sur tes données, une rectification,
          ou l'exercice de tout autre droit prévu par le RGPD.
        </P>
      </Section>

      <Section title="Conservation des données">
        <P>
          Tes données sont conservées tant que ton compte existe. Elles sont supprimées
          définitivement et immédiatement à la suppression de ton compte.
        </P>
      </Section>

      <Section title="Mineurs">
        <P>
          L'app ne s'adresse pas aux enfants de moins de 16 ans et ne collecte pas
          consciemment leurs données.
        </P>
      </Section>

      <Section title="Modifications">
        <P>
          Si cette politique change de façon significative, nous t'en informerons dans l'app avant
          l'entrée en vigueur des changements.
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
