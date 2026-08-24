import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useHealthMetrics } from '@/lib/data/queries';
import { secureStorage } from '@/lib/secure-storage';
import { addTicket, loadTickets, reopenTicket, type SupportTicket } from './tickets';

const SUPPORT_EMAIL = 'support@kaizensupotsu.uk';
const MARKETING_URL = 'https://kaizensupotsu.uk';
const APP_STORE_ID = '6801142789';
const RATE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
const APP_VERSION = (Constants.expoConfig?.version as string | undefined) ?? '1.0.0';

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
  const { t } = useTranslation();
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

  const QUICK: { icon: string; label: string; path: Href }[] = useMemo(() => [
    { icon: '📱', label: t('support.screen.quickAccess.device'), path: '/profile/connectors' },
    { icon: '🔄', label: t('support.screen.quickAccess.sync'), path: '/profile/integrations' },
    { icon: '🏋', label: t('support.screen.quickAccess.workout'), path: '/sport/workout/new' },
    { icon: '🍽', label: t('support.screen.quickAccess.nutrition'), path: '/nutrition' },
    { icon: '❤️', label: t('support.screen.quickAccess.health'), path: '/sommeil' },
    { icon: '⚙', label: t('support.screen.quickAccess.settings'), path: '/profile/settings' },
  ], [t]);

  const GUIDES: { title: string; minutes: number; level: string; steps: string[] }[] = useMemo(() => [
    { title: t('support.screen.guides.firstSteps.title'), minutes: 3, level: t('support.screen.guides.level.beginner'), steps: [t('support.screen.guides.firstSteps.step1'), t('support.screen.guides.firstSteps.step2'), t('support.screen.guides.firstSteps.step3')] },
    { title: t('support.screen.guides.appleHealth.title'), minutes: 5, level: t('support.screen.guides.level.beginner'), steps: [t('support.screen.guides.appleHealth.step1'), t('support.screen.guides.appleHealth.step2'), t('support.screen.guides.appleHealth.step3'), t('support.screen.guides.appleHealth.step4')] },
    { title: t('support.screen.guides.garmin.title'), minutes: 4, level: t('support.screen.guides.level.intermediate'), steps: [t('support.screen.guides.garmin.step1'), t('support.screen.guides.garmin.step2'), t('support.screen.guides.garmin.step3')] },
    { title: t('support.screen.guides.renpho.title'), minutes: 3, level: t('support.screen.guides.level.beginner'), steps: [t('support.screen.guides.renpho.step1'), t('support.screen.guides.renpho.step2'), t('support.screen.guides.renpho.step3')] },
    { title: t('support.screen.guides.deficit.title'), minutes: 2, level: t('support.screen.guides.level.beginner'), steps: [t('support.screen.guides.deficit.step1'), t('support.screen.guides.deficit.step2'), t('support.screen.guides.deficit.step3')] },
    { title: t('support.screen.guides.recovery.title'), minutes: 3, level: t('support.screen.guides.level.intermediate'), steps: [t('support.screen.guides.recovery.step1'), t('support.screen.guides.recovery.step2'), t('support.screen.guides.recovery.step3')] },
  ], [t]);

  const FAQ: { q: string; a: string }[] = useMemo(() => [
    { q: t('support.screen.faq.sleep.q'), a: t('support.screen.faq.sleep.a') },
    { q: t('support.screen.faq.hrv.q'), a: t('support.screen.faq.hrv.a') },
    { q: t('support.screen.faq.garmin.q'), a: t('support.screen.faq.garmin.a') },
    { q: t('support.screen.faq.kaizenScore.q'), a: t('support.screen.faq.kaizenScore.a') },
    { q: t('support.screen.faq.deficit.q'), a: t('support.screen.faq.deficit.a') },
    { q: t('support.screen.faq.export.q'), a: t('support.screen.faq.export.a') },
  ], [t]);

  const SERVICES: string[] = useMemo(() => [
    t('support.screen.services.garminApi'),
    t('support.screen.services.appleHealth'),
    t('support.screen.services.renpho'),
    t('support.screen.services.kaizenServers'),
    t('support.screen.services.sync'),
  ], [t]);

  const CHANGELOG: { v: string; items: string[] }[] = useMemo(() => [
    { v: '2.3', items: [t('support.screen.changelog.v23.item1'), t('support.screen.changelog.v23.item2'), t('support.screen.changelog.v23.item3')] },
    { v: '2.2', items: [t('support.screen.changelog.v22.item1'), t('support.screen.changelog.v22.item2'), t('support.screen.changelog.v22.item3')] },
    { v: '2.1', items: [t('support.screen.changelog.v21.item1'), t('support.screen.changelog.v21.item2'), t('support.screen.changelog.v21.item3')] },
  ], [t]);

  /** Only real destinations — Documentation/Feuille de route had no actual
   *  page to send anyone to (they silently pointed at the private dev repo on
   *  GitHub), so they're gone rather than faked; the Guides section above
   *  already covers documentation in-app. */
  const RESOURCES: { label: string; path: Href }[] = useMemo(() => [
    { label: t('support.screen.resources.community'), path: '/profile/community' },
  ], [t]);

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
  }, [query, FAQ]);

  const openUrl = (url: string): void => { void Linking.openURL(url).catch(() => undefined); };
  const mail = (subject: string, body = ''): void => openUrl(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);

  const techInfo = useMemo(() => [
    [t('support.screen.techInfo.version'), APP_VERSION],
    [t('support.screen.techInfo.platform'), Platform.OS],
    [t('support.screen.techInfo.osVersion'), `${Platform.Version}`],
    [t('support.screen.techInfo.healthData'), t('support.screen.techInfo.healthDataValue', { count: health.length })],
    [t('support.screen.techInfo.lastSync'), lastSync ? new Date(lastSync).toLocaleString('fr-FR') : '—'],
    [t('support.screen.techInfo.installId'), installId],
  ] as [string, string][], [health.length, lastSync, installId, t]);

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
      { label: t('support.screen.diagnostic.items.internet'), status: 'run' },
      { label: t('support.screen.diagnostic.items.server'), status: 'run' },
      { label: t('support.screen.diagnostic.items.appVersion'), status: 'run' },
      { label: t('support.screen.diagnostic.items.healthData'), status: 'run' },
      { label: t('support.screen.diagnostic.items.recentSync'), status: 'run' },
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
    const subject = compose.trim() || (kind === 'bug' ? t('support.screen.contact.defaultBugSubject') : t('support.screen.contact.defaultIdeaSubject'));
    setTickets(await addTicket(kind, subject, compose.trim()));
    setCompose('');
    mail(`[${kind === 'bug' ? t('support.screen.contact.ticketPrefixBug') : t('support.screen.contact.ticketPrefixIdea')}] ${subject}`, `\n\n---\nKaizen ${APP_VERSION} · ${Platform.OS} ${Platform.Version} · install ${installId}`);
  };

  const STATUS_LABEL: Record<SupportTicket['status'], { label: string; tone: 'success' | 'warning' | 'info' }> = {
    open: { label: t('support.screen.tickets.status.open'), tone: 'info' }, in_progress: { label: t('support.screen.tickets.status.inProgress'), tone: 'warning' }, waiting: { label: t('support.screen.tickets.status.waiting'), tone: 'warning' }, resolved: { label: t('support.screen.tickets.status.resolved'), tone: 'success' },
  };

  return (
    <Screen scroll>
      {/* Topbar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text variant="title">{t('support.screen.title')}</Text>
          <Text variant="caption" color="textSubtle">{t('support.screen.subtitle')}</Text>
        </View>
      </View>

      {/* Besoin d'aide */}
      <Card>
        <Text variant="heading">{t('support.screen.helpCard.title')}</Text>
        <View style={{ marginTop: spacing[2] }}>
          <Input placeholder={t('support.screen.helpCard.searchPlaceholder')} value={query} onChangeText={setQuery} />
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
      <Section title={t('support.screen.quickAccess.title')}>
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
      <Section title={t('support.screen.guides.title')}>
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
      <Section title={t('support.screen.faq.title')}>
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
      <Section title={t('support.screen.services.title')}>
        <Card>
          {SERVICES.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: i < SERVICES.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text variant="body">{s}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentData }} />
                <Text variant="caption" color="textSubtle">{t('support.screen.services.operational')}</Text>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      {/* Diagnostic */}
      <Section title={t('support.screen.diagnostic.title')}>
        <Card>
          <Text variant="body" color="textMuted">{t('support.screen.diagnostic.description')}</Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
            <Button label={t('support.screen.diagnostic.run')} onPress={runDiagnostic} />
          </View>
          {diag.length > 0 ? (
            <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
              {diag.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: d.status === 'ok' ? colors.accentData : d.status === 'warn' ? colors.warning : colors.surfaceElevated }}>
                    {d.status === 'ok' ? <Text style={{ color: '#04140b', fontSize: 11, fontWeight: '800' }}>✓</Text> : d.status === 'warn' ? <Text style={{ color: '#04140b', fontSize: 11, fontWeight: '800' }}>!</Text> : null}
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>{d.label}</Text>
                  <Text variant="caption" color="textSubtle">{d.status === 'idle' ? t('support.screen.diagnostic.status.idle') : d.status === 'ok' ? t('support.screen.diagnostic.status.ok') : d.status === 'warn' ? t('support.screen.diagnostic.status.warn') : ''}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Section>

      {/* Contacter le support */}
      <Section title={t('support.screen.contact.title')}>
        <Card>
          <Input placeholder={t('support.screen.contact.placeholder')} value={compose} onChangeText={setCompose} multiline />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label={t('support.screen.contact.reportBug')} onPress={() => send('bug')} />
            <Button label={t('support.screen.contact.proposeIdea')} variant="secondary" onPress={() => send('idea')} />
            <Button label={t('support.screen.contact.email')} variant="secondary" onPress={() => mail(t('support.screen.contact.emailSubject'))} />
            <Button label={t('support.screen.contact.helpCenter')} variant="secondary" onPress={() => openUrl(MARKETING_URL)} />
          </View>
        </Card>
      </Section>

      {/* Mes demandes */}
      {tickets.length > 0 ? (
        <Section title={t('support.screen.tickets.title')}>
          <Card>
            {tickets.map((t2, i) => (
              <View key={t2.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < tickets.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{t2.subject}</Text>
                  <Text variant="caption" color="textSubtle">{t2.ref} · {new Date(t2.createdAt).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Badge label={STATUS_LABEL[t2.status].label} tone={STATUS_LABEL[t2.status].tone} />
                {t2.status === 'resolved' ? <Pressable onPress={async () => setTickets(await reopenTicket(t2.id))} hitSlop={8}><Text variant="caption" color="primary">{t('support.screen.tickets.reopen')}</Text></Pressable> : null}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {/* Nouveautés */}
      <Section title={t('support.screen.changelog.title')}>
        {CHANGELOG.map((c) => (
          <Card key={c.v}>
            <Text variant="body" style={{ fontWeight: '700' }}>{t('support.screen.changelog.version', { version: c.v })}</Text>
            <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
              {c.items.map((it, j) => (<Text key={j} variant="caption" color="textMuted">• {it}</Text>))}
            </View>
          </Card>
        ))}
      </Section>

      {/* Ressources */}
      <Section title={t('support.screen.resources.title')}>
        <Card>
          {RESOURCES.map((r, i) => (
            <Pressable key={r.label} onPress={() => router.push(r.path)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[3], borderBottomWidth: i < RESOURCES.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text variant="body">{r.label}</Text>
                <Text variant="body" color="textSubtle">›</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      </Section>

      {/* Informations techniques */}
      <Section title={t('support.screen.techInfo.title')} right={<Pressable onPress={copyTech}><Text variant="caption" color="primary">{copied ? t('support.screen.techInfo.copied') : t('support.screen.techInfo.copy')}</Text></Pressable>}>
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
      <Section title={t('support.screen.actions.title')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Button label={t('support.screen.actions.support')} onPress={() => mail(t('support.screen.contact.emailSubject'))} />
          <Button label={t('support.screen.actions.rate')} variant="secondary" onPress={() => openUrl(RATE_URL)} />
          <Button label={t('support.screen.actions.privacy')} variant="secondary" onPress={() => router.push('/privacy')} />
          <Button label={t('support.screen.actions.terms')} variant="secondary" onPress={() => router.push('/terms')} />
        </View>
      </Section>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
