import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Badge, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useHealthMetrics } from '@/lib/data/queries';
import { secureStorage } from '@/lib/secure-storage';
import { addTicket, loadTickets, reopenTicket, type SupportTicket } from './tickets';

const SUPPORT_EMAIL = 'support@kaizen-supotsu.app';
const REPO_URL = 'https://github.com/ykngame-coder/Kaizen';
const APP_VERSION = (Constants.expoConfig?.version as string | undefined) ?? '1.0.0';

const QUICK: { icon: string; label: string; path: Href }[] = [
  { icon: '📱', label: 'Configurer un appareil', path: '/profile/connectors' },
  { icon: '🔄', label: 'Problème de synchronisation', path: '/profile/integrations' },
  { icon: '🏋', label: 'Ajouter un entraînement', path: '/sport/workout/new' },
  { icon: '🍽', label: 'Utiliser la nutrition', path: '/nutrition' },
  { icon: '❤️', label: 'Comprendre mes données santé', path: '/sommeil' },
  { icon: '⚙', label: 'Paramètres', path: '/profile/settings' },
];

const GUIDES: { title: string; minutes: number; level: string; steps: string[] }[] = [
  { title: 'Premiers pas avec Kaizen', minutes: 3, level: 'Débutant', steps: ['Crée ton compte et renseigne ton profil (poids, taille, objectif).', 'Connecte une source de données (Apple Santé, Garmin ou Renpho).', 'Fixe un objectif principal dans Objectifs — il personnalise toute l’app.'] },
  { title: 'Configurer Apple Santé (Health Auto Export)', minutes: 5, level: 'Débutant', steps: ['Installe Health Auto Export sur iPhone.', 'Profil → Appareils → Apple Santé → génère ton jeton.', 'Dans HAE : Automations → REST API, colle l’URL (jeton inclus), méthode POST, format JSON.', 'Coche sommeil, FC repos, poids… puis exécute une fois pour vérifier.'] },
  { title: 'Connecter Garmin', minutes: 4, level: 'Intermédiaire', steps: ['Profil → Appareils → Garmin → Connecter.', 'Autorise l’accès dans la fenêtre Garmin Connect.', 'Tes activités et données santé (sommeil, HRV, FC) se synchronisent.'] },
  { title: 'Configurer Renpho', minutes: 3, level: 'Débutant', steps: ['Active la synchronisation Apple Santé dans l’app Renpho.', 'Pèse-toi : poids, masse grasse et musculaire partent vers Apple Santé.', 'Kaizen les récupère via Health Auto Export, source “Renpho”.'] },
  { title: 'Suivre son déficit calorique', minutes: 2, level: 'Débutant', steps: ['Ouvre Journal & déficit.', 'Ajoute tes repas (recherche, saisie manuelle).', 'Ajuste tes objectifs kcal/macros si besoin dans Nutrition.'] },
  { title: 'Comprendre le Recovery Score', minutes: 3, level: 'Intermédiaire', steps: ['Le score combine sommeil, HRV et FC de repos vs tes moyennes.', 'Plus il est haut, plus tu es prêt pour une séance intense.', 'Sans HRV (Garmin ne la pousse pas vers Santé), il s’appuie surtout sur le sommeil.'] },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Pourquoi mon sommeil n’apparaît-il pas ?', a: 'Vérifie que ta source envoie bien des nuits : Apple Santé via Health Auto Export (coche “Sleep Analysis”) ou un export Garmin. Sur l’écran Sommeil, la qualité s’affiche dès qu’une nuit est reçue, quelle que soit la source.' },
  { q: 'Pourquoi mon HRV est-il vide ?', a: 'Garmin ne transmet pas la HRV à Apple Santé — aucune app tierce ne peut la re-partager. Pour la HRV, utilise l’import d’un export Garmin.' },
  { q: 'Comment connecter Garmin ?', a: 'Profil → Appareils → Garmin → Connecter, puis autorise l’accès dans Garmin Connect. Nécessite le backend déployé.' },
  { q: 'Comment fonctionne le Score Kaizen ?', a: 'C’est une lecture composite de ta forme : récupération, sommeil, charge d’entraînement et régularité. Chaque composante est explicable et affichée séparément — jamais un chiffre opaque.' },
  { q: 'Comment calculer mon déficit calorique ?', a: 'Déficit = objectif calorique − calories consommées. Kaizen estime ta cible depuis ton poids, mais tu peux l’ajuster manuellement dans Nutrition (kcal, protéines, eau).' },
  { q: 'Comment exporter mes données ?', a: 'Réglages → Confidentialité → Exporter mes données (JSON, format RGPD). Tu peux aussi le faire depuis Données & intégrations.' },
];

const SERVICES = ['API Garmin', 'Apple Santé', 'Renpho', 'Serveurs Kaizen', 'Synchronisation'];

const CHANGELOG: { v: string; items: string[] }[] = [
  { v: '2.3', items: ['Écrans Santé détaillés (HRV, FC repos, Stress, VO₂).', 'Photos d’évolution avant/après.', 'Navigation par jour dans le calendrier.'] },
  { v: '2.2', items: ['Objectifs nutrition ajustables (kcal/macros/eau).', 'Écran Habitudes & discipline dédié.', 'Silhouette musculaire anatomique précise.'] },
  { v: '2.1', items: ['Reconstruction premium de tous les écrans.', 'Bibliothèque de 873 exercices.', 'Import Apple Santé via Health Auto Export.'] },
];

const RESOURCES: { label: string; url: string }[] = [
  { label: 'Documentation', url: REPO_URL },
  { label: 'Feuille de route', url: REPO_URL },
  { label: 'Communauté', url: REPO_URL },
];

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="heading">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Accordion({ title, subtitle, open, onToggle, children }: { title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Card>
      <Pressable onPress={onToggle} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ fontWeight: '600' }}>{title}</Text>
            {subtitle ? <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          <Text variant="subtitle" color="textSubtle">{open ? '−' : '+'}</Text>
        </View>
      </Pressable>
      {open ? <View style={{ marginTop: spacing[3], gap: spacing[2] }}>{children}</View> : null}
    </Card>
  );
}

/** Aide & Support (mockup #22) — help center: search, guides, FAQ, status, diagnostic, contact, tickets. */
export function SupportScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openGuide, setOpenGuide] = useState<number | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [compose, setCompose] = useState('');
  const [copied, setCopied] = useState(false);
  const [installId, setInstallId] = useState('—');

  // Diagnostic state
  const [diag, setDiag] = useState<{ label: string; status: 'idle' | 'run' | 'ok' | 'warn' }[]>([]);

  useEffect(() => {
    void loadTickets().then(setTickets);
    void (async () => {
      let id = await secureStorage.getItem('supotsu.installId');
      if (!id) {
        id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        await secureStorage.setItem('supotsu.installId', id);
      }
      setInstallId(id);
    })();
  }, []);

  const lastSync = useMemo(() => (health.length ? health.reduce((m, x) => (x.measuredAt > m ? x.measuredAt : m), health[0]!.measuredAt) : null), [health]);

  const faqFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  const openUrl = (url: string): void => { void Linking.openURL(url).catch(() => undefined); };
  const mail = (subject: string, body = ''): void => openUrl(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);

  const techInfo = useMemo(() => [
    ['Version de Kaizen', APP_VERSION],
    ['Plateforme', Platform.OS],
    ['Version OS', `${Platform.Version}`],
    ['Données santé', `${health.length} mesures`],
    ['Dernière synchronisation', lastSync ? new Date(lastSync).toLocaleString('fr-FR') : '—'],
    ['Identifiant d’installation', installId],
  ] as [string, string][], [health.length, lastSync, installId]);

  const copyTech = async (): Promise<void> => {
    const text = techInfo.map(([k, v]) => `${k}: ${v}`).join('\n');
    try {
      if (Platform.OS === 'web' && (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator?.clipboard) {
        await (globalThis as { navigator: { clipboard: { writeText(s: string): Promise<void> } } }).navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const runDiagnostic = async (): Promise<void> => {
    const items: { label: string; status: 'idle' | 'run' | 'ok' | 'warn' }[] = [
      { label: 'Connexion Internet', status: 'run' },
      { label: 'Serveur Kaizen (Supabase)', status: 'run' },
      { label: 'Version de l’application', status: 'run' },
      { label: 'Données santé présentes', status: 'run' },
      { label: 'Synchronisation récente', status: 'run' },
    ];
    setDiag(items.map((i) => ({ ...i, status: 'idle' })));
    const set = (idx: number, status: 'ok' | 'warn') => setDiag((prev) => prev.map((p, i) => (i === idx ? { ...p, status } : p)));

    const online = Platform.OS === 'web' ? ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine ?? true) : true;
    await new Promise((r) => setTimeout(r, 300)); set(0, online ? 'ok' : 'warn');

    let supaOk = false;
    try {
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (url) { await fetch(`${url}/auth/v1/health`).catch(() => fetch(url)); supaOk = true; }
    } catch { supaOk = false; }
    await new Promise((r) => setTimeout(r, 400)); set(1, supaOk ? 'ok' : 'warn');
    await new Promise((r) => setTimeout(r, 300)); set(2, 'ok');
    await new Promise((r) => setTimeout(r, 300)); set(3, health.length > 0 ? 'ok' : 'warn');
    const recent = lastSync != null && Date.now() - new Date(lastSync).getTime() < 3 * 86_400_000;
    await new Promise((r) => setTimeout(r, 300)); set(4, recent ? 'ok' : 'warn');
  };

  const send = async (kind: 'bug' | 'idea'): Promise<void> => {
    const subject = compose.trim() || (kind === 'bug' ? 'Bug signalé' : 'Idée proposée');
    setTickets(await addTicket(kind, subject, compose.trim()));
    setCompose('');
    mail(`[${kind === 'bug' ? 'Bug' : 'Idée'}] ${subject}`, `\n\n---\nKaizen ${APP_VERSION} · ${Platform.OS} ${Platform.Version} · install ${installId}`);
  };

  const STATUS_LABEL: Record<SupportTicket['status'], { label: string; tone: 'success' | 'warning' | 'info' }> = {
    open: { label: 'Ouvert', tone: 'info' }, in_progress: { label: 'En cours', tone: 'warning' }, waiting: { label: 'En attente', tone: 'warning' }, resolved: { label: 'Résolu', tone: 'success' },
  };

  return (
    <Screen scroll>
      {/* Topbar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text variant="title">Aide & Support</Text>
          <Text variant="caption" color="textSubtle">FAQ • Assistance • Contact</Text>
        </View>
      </View>

      {/* Besoin d'aide */}
      <Card>
        <Text variant="heading">Comment pouvons-nous t’aider ?</Text>
        <View style={{ marginTop: spacing[2] }}>
          <Input placeholder="Rechercher une question ou un problème…" value={query} onChangeText={setQuery} />
        </View>
        {query.trim() && faqFiltered.length > 0 ? (
          <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
            {faqFiltered.slice(0, 4).map((f, i) => (
              <Pressable key={i} onPress={() => { setOpenFaq(FAQ.indexOf(f)); setQuery(''); }}><Text variant="body" color="primary">{f.q}</Text></Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      {/* Accès rapides */}
      <Section title="Accès rapides">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          {QUICK.map((q) => (
            <Pressable key={q.label} onPress={() => router.push(q.path)} style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', opacity: pressed ? 0.7 : 1 })}>
              <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4], gap: spacing[2] }}>
                <Text style={{ fontSize: 22 }}>{q.icon}</Text>
                <Text variant="body" style={{ fontWeight: '600' }}>{q.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Section>

      {/* Guides */}
      <Section title="Guides interactifs">
        {GUIDES.map((g, i) => (
          <Accordion key={g.title} title={g.title} subtitle={`${g.minutes} min · ${g.level}`} open={openGuide === i} onToggle={() => setOpenGuide(openGuide === i ? null : i)}>
            {g.steps.map((s, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: spacing[2] }}>
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>{j + 1}.</Text>
                <Text variant="body" color="textMuted" style={{ flex: 1, lineHeight: 20 }}>{s}</Text>
              </View>
            ))}
          </Accordion>
        ))}
      </Section>

      {/* FAQ */}
      <Section title="Questions fréquentes">
        {faqFiltered.map((f) => {
          const idx = FAQ.indexOf(f);
          return (
            <Accordion key={f.q} title={f.q} open={openFaq === idx} onToggle={() => setOpenFaq(openFaq === idx ? null : idx)}>
              <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>{f.a}</Text>
            </Accordion>
          );
        })}
      </Section>

      {/* État des services */}
      <Section title="État des services">
        <Card>
          {SERVICES.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: i < SERVICES.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text variant="body">{s}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentData }} />
                <Text variant="caption" color="textSubtle">Opérationnel</Text>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      {/* Diagnostic */}
      <Section title="Diagnostic automatique">
        <Card>
          <Text variant="body" color="textMuted">Kaizen vérifie ta connexion, le serveur, tes données et la synchronisation.</Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
            <Button label="Lancer un diagnostic" onPress={runDiagnostic} />
          </View>
          {diag.length > 0 ? (
            <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
              {diag.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: d.status === 'ok' ? colors.accentData : d.status === 'warn' ? colors.warning : colors.surfaceElevated }}>
                    {d.status === 'ok' ? <Text style={{ color: '#04140b', fontSize: 11, fontWeight: '800' }}>✓</Text> : d.status === 'warn' ? <Text style={{ color: '#04140b', fontSize: 11, fontWeight: '800' }}>!</Text> : null}
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>{d.label}</Text>
                  <Text variant="caption" color="textSubtle">{d.status === 'idle' ? '…' : d.status === 'ok' ? 'OK' : d.status === 'warn' ? 'À vérifier' : ''}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Section>

      {/* Contacter le support */}
      <Section title="Contacter le support">
        <Card>
          <Input placeholder="Décris ton problème ou ton idée…" value={compose} onChangeText={setCompose} multiline />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label="🐞 Signaler un bug" onPress={() => send('bug')} />
            <Button label="💡 Proposer une idée" variant="secondary" onPress={() => send('idea')} />
            <Button label="📧 E-mail" variant="secondary" onPress={() => mail('Demande de support Kaizen')} />
            <Button label="🌐 Centre d’aide" variant="secondary" onPress={() => openUrl(REPO_URL)} />
          </View>
        </Card>
      </Section>

      {/* Mes demandes */}
      {tickets.length > 0 ? (
        <Section title="Mes demandes">
          <Card>
            {tickets.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < tickets.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{t.subject}</Text>
                  <Text variant="caption" color="textSubtle">{t.ref} · {new Date(t.createdAt).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Badge label={STATUS_LABEL[t.status].label} tone={STATUS_LABEL[t.status].tone} />
                {t.status === 'resolved' ? <Pressable onPress={async () => setTickets(await reopenTicket(t.id))} hitSlop={8}><Text variant="caption" color="primary">Rouvrir</Text></Pressable> : null}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {/* Nouveautés */}
      <Section title="Nouveautés">
        {CHANGELOG.map((c) => (
          <Card key={c.v}>
            <Text variant="body" style={{ fontWeight: '700' }}>Version {c.v}</Text>
            <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
              {c.items.map((it, j) => (<Text key={j} variant="caption" color="textMuted">• {it}</Text>))}
            </View>
          </Card>
        ))}
      </Section>

      {/* Ressources */}
      <Section title="Ressources">
        <Card>
          {RESOURCES.map((r, i) => (
            <Pressable key={r.label} onPress={() => openUrl(r.url)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[3], borderBottomWidth: i < RESOURCES.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text variant="body">{r.label}</Text>
                <Text variant="body" color="textSubtle">›</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      </Section>

      {/* Informations techniques */}
      <Section title="Informations techniques" right={<Pressable onPress={copyTech}><Text variant="caption" color="primary">{copied ? 'Copié ✓' : 'Copier'}</Text></Pressable>}>
        <Card>
          {techInfo.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: i < techInfo.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text variant="caption" color="textMuted">{k}</Text>
              <Text variant="caption" selectable style={{ fontWeight: '600', color: colors.text }}>{v}</Text>
            </View>
          ))}
        </Card>
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Button label="📩 Support" onPress={() => mail('Demande de support Kaizen')} />
          <Button label="⭐ Évaluer l’app" variant="secondary" onPress={() => openUrl(REPO_URL)} />
          <Button label="📄 Confidentialité" variant="secondary" onPress={() => openUrl(REPO_URL)} />
          <Button label="⚖ Conditions" variant="secondary" onPress={() => openUrl(REPO_URL)} />
        </View>
      </Section>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
