import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';

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

/** Highlighted callout for the medical-disclaimer and health-data-consent sections. */
function Callout({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View
      style={{
        marginTop: spacing[4],
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: 'rgba(245,183,66,0.3)',
        backgroundColor: 'rgba(245,183,66,0.08)',
        padding: spacing[4],
        gap: spacing[2],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        {icon}
        <Text variant="body" style={{ fontWeight: '700', flex: 1 }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Politique de confidentialité — reachable while signed out (App Store Connect "Privacy Policy URL"). */
export function PrivacyPolicyScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen scroll>
      <Text variant="title">Politique de confidentialité</Text>
      <Text variant="caption" color="textSubtle">Kaizen Supotsu · Dernière mise à jour : {LAST_UPDATED}</Text>
      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Badge label="Version Bêta · Développeur indépendant" tone="warning" />
      </View>

      <Callout icon={<Icon name="warning" size={18} color={colors.warning} />} title="Avertissement important — absence de conseil médical">
        <P>
          Kaizen Supotsu n'est pas un dispositif médical et ne fournit aucun conseil, diagnostic ou
          traitement médical.
        </P>
        <P>
          Les analyses, données, indicateurs et scores (récupération, sommeil, charge de travail,
          HRV, etc.) générés par l'application sont fournis à titre purement indicatif, informatif
          et éducatif.
        </P>
        <P>
          Ils ne remplacent en aucun cas l'avis, le diagnostic ou le suivi d'un médecin ou d'un
          professionnel de santé qualifié.
        </P>
        <P>
          Ne modifie jamais un traitement médical ou un programme d'entraînement intensif sans
          demander l'avis préalable de ton médecin.
        </P>
        <P>
          En cas de malaise, douleur ou doute sur ton état de santé, consulte immédiatement un
          professionnel de santé.
        </P>
      </Callout>

      <Callout icon={<Icon name="lock" size={18} color={colors.warning} />} title="Consentement explicite et traitement des données de santé (RGPD)">
        <P>
          Conformément à l'article 9 du Règlement Général sur la Protection des Données (RGPD), les
          données relatives à l'activité physique, au sommeil et à la physiologie (fréquence
          cardiaque, HRV, composition corporelle) constituent des données de santé à caractère
          personnel.
        </P>
        <P>
          <Text style={{ fontWeight: '700' }}>Ton consentement préalable</Text> : nous ne collectons
          et ne traitons ces données qu'avec ton consentement explicite, recueilli lors de la
          création de ton compte et via les pop-ups d'autorisation (HealthKit, Garmin, Strava).
        </P>
        <P>
          <Text style={{ fontWeight: '700' }}>Contrôle total</Text> : tu peux retirer ce consentement
          à tout moment en révoquant les accès dans les Réglages de ton téléphone ou en supprimant
          ton compte. Le retrait de ce consentement entraînera l'impossibilité d'utiliser les
          fonctionnalités d'analyse de l'app.
        </P>
      </Callout>

      <Section title="1. Qui nous sommes">
        <P>
          L'application Kaizen Supotsu ("l'app", "nous") est développée et éditée par Yannick
          MPAKA, développeur indépendant (particulier), responsable du traitement des données au
          sens du RGPD.
        </P>
        <P>
          Kaizen Supotsu centralise et explique tes données de santé, de forme et de sport —
          sommeil, fréquence cardiaque, variabilité cardiaque (HRV), poids, composition corporelle,
          séances d'entraînement, nutrition — pour t'aider à comprendre ta forme et ta progression.
        </P>
        <P>
          Cette politique décrit quelles données nous traitons, pourquoi, et comment tu gardes le
          contrôle dessus.
        </P>
        <P>
          Pour toute question concernant tes données, tu peux contacter le responsable de
          traitement à : {SUPPORT_EMAIL}.
        </P>
      </Section>

      <Section title="2. Données que nous collectons">
        <P>
          Le traitement de tes données repose sur ton consentement explicite et sur le bon
          fonctionnement des services de l'app :
        </P>
        <P>
          • Compte utilisateur : adresse e-mail, mot de passe (chiffré de manière sécurisée et
          jamais lisible par nous). Si tu choisis de te connecter avec Apple ou Google, nous
          recevons uniquement ton adresse e-mail et ton nom depuis ces services — rien d'autre de
          ton compte Apple ou Google.
        </P>
        <P>
          • Données de santé et de forme : lues depuis Apple Santé (HealthKit) — sommeil et ses
          phases, fréquence cardiaque de repos, HRV, poids, masse grasse, masse maigre, séances
          d'entraînement — uniquement si tu autorises explicitement chaque catégorie depuis l'app
          ou dans les Réglages iOS.
        </P>
        <P>
          • Activités et séances : données enregistrées dans l'app ou synchronisées depuis des
          services tiers que tu choisis de connecter (Garmin Connect, Strava).
        </P>
        <P>• Nutrition : repas et hydratation que tu saisis toi-même.</P>
        <P>• Profil : photo de profil (si tu en ajoutes une, stockée de façon sécurisée).</P>
        <P>
          • Données techniques minimales : identifiant de compte, horodatages et logs de connexion
          indispensables au fonctionnement et à la sécurité.
        </P>
      </Section>

      <Section title="3. Comment nous utilisons tes données">
        <P>Tes données sont utilisées uniquement pour t'offrir le service :</P>
        <P>• Calculer tes scores (récupération, sommeil, charge de travail) ;</P>
        <P>• Générer des recommandations, synthèses et explications sur ta progression ;</P>
        <P>• Afficher tes tendances graphiques ;</P>
        <P>
          • Faire fonctionner les fonctionnalités communautaires que tu choisis d'utiliser (défis,
          classements).
        </P>
        <P>
          <Text style={{ fontWeight: '700' }}>Engagement strict</Text> : nous ne vendons jamais tes
          données à des tiers, nous ne les louons pas et nous ne les utilisons pas à des fins
          publicitaires. Les données obtenues via Apple HealthKit ne seront en aucun cas utilisées
          à des fins de marketing ou de publicité.
        </P>
      </Section>

      <Section title="4. Partage et sous-traitants">
        <P>
          Tes données sont hébergées chez Supabase (base de données et authentification), notre
          sous-traitant technique. Les serveurs de Supabase garantissent un niveau de sécurité
          adéquat et conforme au RGPD.
        </P>
        <P>
          Si tu connectes Garmin, Strava ou Apple Santé, l'app échange des données avec ces
          services selon les autorisations que tu leur accordes directement — nous ne recevons que
          ce que tu as explicitement autorisé.
        </P>
        <P>
          Si tu te connectes via Apple ou Google, ces services agissent comme fournisseurs
          d'identité : ils nous transmettent ton e-mail et ton nom pour créer ton compte, sans que
          nous accédions à quoi que ce soit d'autre sur ces comptes.
        </P>
      </Section>

      <Section title="5. Sécurité et avertissement Bêta">
        <P>
          <Text style={{ fontWeight: '700' }}>Sécurité</Text> : l'accès à tes données est strictement
          restreint à ton compte (règles de sécurité Row Level Security au niveau de la base de
          données). Les échanges avec nos serveurs sont chiffrés en HTTPS (TLS).
        </P>
        <P>
          <Text style={{ fontWeight: '700' }}>Version Bêta</Text> : l'application est actuellement
          proposée en version de test ("Bêta"). Malgré le soin apporté à la sécurité, tu es informé
          que des bugs, interruptions ou pertes temporaires de données peuvent survenir durant
          cette phase.
        </P>
      </Section>

      <Section title="6. Tes droits (RGPD)">
        <P>Tu restes le seul propriétaire de tes données. Tu peux à tout moment :</P>
        <P>
          • <Text style={{ fontWeight: '700' }}>Exporter tes données</Text> : obtenir une copie
          intégrale de tes données au format JSON depuis l'application via Réglages → Exporter mes
          données.
        </P>
        <P>
          • <Text style={{ fontWeight: '700' }}>Supprimer ton compte</Text> : supprimer
          définitivement ton compte et toutes les données associées depuis Réglages → Supprimer mon
          compte. Cette action est irréversible et immédiate.
        </P>
        <P>
          • <Text style={{ fontWeight: '700' }}>Exercer tes droits</Text> : retirer ton consentement
          ou demander la rectification de tes données en nous écrivant à {SUPPORT_EMAIL}.
        </P>
        <P>
          • <Text style={{ fontWeight: '700' }}>Réclamation</Text> : tu disposes du droit
          d'introduire une réclamation auprès de la CNIL (cnil.fr) si tu estimes que tes droits ne
          sont pas respectés.
        </P>
      </Section>

      <Section title="7. Conservation des données">
        <P>
          Tes données sont conservées tant que ton compte est actif. En cas de suppression de
          compte, toutes tes données sont effacées définitivement et immédiatement de nos serveurs
          principaux. Les copies de sauvegarde sont purgées sous 30 jours.
        </P>
      </Section>

      <Section title="8. Mineurs">
        <P>
          L'application ne s'adresse pas aux mineurs de moins de 16 ans et nous ne collectons pas
          sciemment leurs données.
        </P>
      </Section>

      <Section title="9. Modifications de cette politique">
        <P>
          Si cette politique change de façon significative, nous t'en informerons dans l'app ou par
          e-mail avant l'entrée en vigueur des changements.
        </P>
      </Section>

      <Section title="10. Contact">
        <P>Pour toute question : {SUPPORT_EMAIL}</P>
      </Section>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[5] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
