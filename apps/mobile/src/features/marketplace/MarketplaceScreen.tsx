import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, SegmentedControl, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { recommendProgram } from '@supotsu/engines';
import type { Activity, ProgramFocus } from '@supotsu/core';
import {
  useActivities,
  useCommunityPrograms,
  useCommunitySessions,
  useCopyProgram,
  useCopySession,
  useDeleteUserProgram,
  useDeleteUserSession,
  useEnrolledProgramIds,
  useEnrollProgram,
  useLaunchSession,
  usePrograms,
  useSetProgramVisibility,
  useSetSessionVisibility,
  useUserPrograms,
  useUserSessions,
} from '@/lib/data/queries';
import { BackButton } from '@/features/navigation/BackButton';

const FOCUS_LABEL: Record<ProgramFocus, string> = {
  strength: 'Force',
  endurance: 'Endurance',
  hyrox: 'Hyrox',
  weight_loss: 'Perte de poids',
  mobility: 'Mobilité',
  general: 'Général',
};
const SESSIONS_QUOTA = 50;
const PROGRAMS_QUOTA = 2;
// "Catalogue" (paid/coach-authored programs) is paused — only that tab, not
// Communauté or Mes créations, which stay fully functional (create/share).
const TABS = [
  { value: 'communaute' as const, label: 'Communauté' },
  { value: 'mescreations' as const, label: 'Mes créations' },
];

/** Transparent rule: the user's dominant recent activity implies a focus. */
function inferFocus(activities: Activity[]): ProgramFocus | undefined {
  if (activities.length === 0) return undefined;
  const map: Record<string, ProgramFocus> = {
    running: 'endurance',
    walking: 'endurance',
    cycling: 'endurance',
    swimming: 'endurance',
    strength: 'strength',
    hyrox: 'hyrox',
    cross_training: 'hyrox',
    mobility: 'mobility',
    yoga: 'mobility',
  };
  const counts = new Map<ProgramFocus, number>();
  for (const a of activities) {
    const focus = map[a.type];
    if (focus) counts.set(focus, (counts.get(focus) ?? 0) + 1);
  }
  let best: ProgramFocus | undefined;
  let bestN = 0;
  for (const [focus, n] of counts) if (n > bestN) [best, bestN] = [focus, n];
  return best;
}

const priceLabel = (cents: number): string => (cents === 0 ? 'Gratuit' : `${(cents / 100).toFixed(0)} €`);

/** Marketplace: explainable program recommendation + coach catalogue + community + own creations (P39). */
export function MarketplaceScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<'communaute' | 'mescreations'>('communaute');

  // --- Catalogue (paused — kept for when it comes back, no longer rendered) --
  const { data: programs = [], isLoading } = usePrograms();
  const { data: activities = [] } = useActivities();
  const { data: enrolledIds = [] } = useEnrolledProgramIds();
  const enroll = useEnrollProgram();
  const enrolledSet = new Set(enrolledIds);
  const asOf = new Date().toISOString();

  const goalFocus = useMemo(() => inferFocus(activities), [activities]);
  const reco = useMemo(
    () => recommendProgram({ goalFocus }, programs, asOf),
    [goalFocus, programs, asOf],
  );
  const confTone: Record<string, BadgeTone> = { high: 'success', medium: 'info', to_confirm: 'warning' };

  // --- Communauté --------------------------------------------------------
  const { data: communitySessions = [] } = useCommunitySessions();
  const { data: communityPrograms = [] } = useCommunityPrograms();
  const copySession = useCopySession();
  const copyProgram = useCopyProgram();
  const [communityError, setCommunityError] = useState<string | null>(null);

  const doCopySession = async (id: string): Promise<void> => {
    setCommunityError(null);
    try {
      await copySession.mutateAsync(id);
    } catch (e) {
      setCommunityError(e instanceof Error ? e.message : 'Copie impossible.');
    }
  };
  const doCopyProgram = async (id: string): Promise<void> => {
    setCommunityError(null);
    try {
      await copyProgram.mutateAsync(id);
    } catch (e) {
      setCommunityError(e instanceof Error ? e.message : 'Copie impossible.');
    }
  };

  // --- Mes créations -------------------------------------------------------
  const { data: mySessions = [] } = useUserSessions();
  const { data: myPrograms = [] } = useUserPrograms();
  const deleteSession = useDeleteUserSession();
  const deleteProgram = useDeleteUserProgram();
  const setSessionVisibility = useSetSessionVisibility();
  const setProgramVisibility = useSetProgramVisibility();
  const launchSession = useLaunchSession();
  const [launchError, setLaunchError] = useState<string | null>(null);

  const doLaunch = async (session: { id: string; name: string }): Promise<void> => {
    setLaunchError(null);
    try {
      const workout = await launchSession.mutateAsync(session);
      // Straight into the live runner — launching a session means "I'm
      // about to do this now", not "show me its summary page".
      router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id } });
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : 'Lancement impossible.');
    }
  };

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">Programmes</Text>
      <Text variant="caption" style={{ color: colors.textMuted }}>
        Des programmes de coachs, de la communauté, ou les tiens.
      </Text>

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      {tab === 'communaute' ? (
        <>
          {communityError ? <Badge label={communityError} tone="error" /> : null}

          <Text variant="heading" style={{ marginTop: spacing[2] }}>Programmes</Text>
          {communityPrograms.length === 0 ? (
            <Text variant="body" color="textMuted">Aucun programme public partagé pour l'instant.</Text>
          ) : (
            <View style={{ gap: spacing[3] }}>
              {communityPrograms.map((p) => (
                <Card key={p.id}>
                  <Text variant="subtitle">{p.title}</Text>
                  <Text variant="caption" color="textMuted">
                    {FOCUS_LABEL[p.focus]} · niveau {p.level} · {p.weeks} semaines
                  </Text>
                  {p.description ? <Text variant="body">{p.description}</Text> : null}
                  <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
                    <Button
                      label={copyProgram.isPending ? '…' : 'Copier dans ma bibliothèque'}
                      variant="secondary"
                      disabled={copyProgram.isPending}
                      onPress={() => void doCopyProgram(p.id)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}

          <Text variant="heading" style={{ marginTop: spacing[3] }}>Séances</Text>
          {communitySessions.length === 0 ? (
            <Text variant="body" color="textMuted">Aucune séance publique partagée pour l'instant.</Text>
          ) : (
            <View style={{ gap: spacing[2] }}>
              {communitySessions.map((s) => (
                <Card key={s.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="body" style={{ fontWeight: '600' }}>{s.name}</Text>
                    <Button
                      label={copySession.isPending ? '…' : 'Copier'}
                      variant="secondary"
                      disabled={copySession.isPending}
                      onPress={() => void doCopySession(s.id)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </>
      ) : null}

      {tab === 'mescreations' ? (
        <>
          {launchError ? <Badge label={launchError} tone="error" /> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing[2] }}>
            <Text variant="heading">Mes séances</Text>
            <Text variant="caption" color="textSubtle">{mySessions.length}/{SESSIONS_QUOTA}</Text>
          </View>
          {mySessions.length === 0 ? (
            <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title="Aucune séance créée" message="Construis ta bibliothèque de séances réutilisables." actionLabel="Créer une séance" onAction={() => router.push('/marketplace/session-builder')} />
          ) : (
            <View style={{ gap: spacing[2] }}>
              {mySessions.map((s) => (
                <Card key={s.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="body" style={{ fontWeight: '600' }}>{s.name}</Text>
                    <Badge label={s.visibility === 'public' ? 'Public' : 'Privé'} tone={s.visibility === 'public' ? 'info' : 'neutral'} />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
                    <Button label="Lancer" disabled={launchSession.isPending} onPress={() => void doLaunch(s)} />
                    <Button
                      label="Modifier"
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/marketplace/session-builder', params: { id: s.id } })}
                    />
                    <Button
                      label={s.visibility === 'public' ? 'Rendre privée' : 'Partager'}
                      variant="secondary"
                      onPress={() => setSessionVisibility.mutate({ sessionId: s.id, visibility: s.visibility === 'public' ? 'private' : 'public' })}
                    />
                    <Button label="Supprimer" variant="danger" onPress={() => deleteSession.mutate(s.id)} />
                  </View>
                </Card>
              ))}
            </View>
          )}
          {mySessions.length > 0 ? (
            <View style={{ marginTop: spacing[2] }}>
              <Button label="+ Nouvelle séance" variant="secondary" onPress={() => router.push('/marketplace/session-builder')} />
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing[4] }}>
            <Text variant="heading">Mes programmes</Text>
            <Text variant="caption" color="textSubtle">{myPrograms.length}/{PROGRAMS_QUOTA}</Text>
          </View>
          {myPrograms.length === 0 ? (
            <EmptyState icon={<Icon name="calendarClock" size={44} color={colors.textSubtle} />} title="Aucun programme créé" message="Construis ton propre programme à partir de tes séances." actionLabel="Créer un programme" onAction={() => router.push('/marketplace/program-builder')} />
          ) : (
            <View style={{ gap: spacing[2] }}>
              {myPrograms.map((p) => (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="subtitle">{p.title}</Text>
                    <Badge label={p.visibility === 'public' ? 'Public' : 'Privé'} tone={p.visibility === 'public' ? 'info' : 'neutral'} />
                  </View>
                  <Text variant="caption" color="textMuted">
                    {FOCUS_LABEL[p.focus]} · {p.weeks} semaines
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
                    <Button
                      label="Planning"
                      onPress={() => router.push({ pathname: '/marketplace/program/[id]', params: { id: p.id } })}
                    />
                    <Button
                      label="Modifier"
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/marketplace/program-builder', params: { id: p.id } })}
                    />
                    <Button
                      label={p.visibility === 'public' ? 'Rendre privé' : 'Partager'}
                      variant="secondary"
                      onPress={() => setProgramVisibility.mutate({ programId: p.id, visibility: p.visibility === 'public' ? 'private' : 'public' })}
                    />
                    <Button label="Supprimer" variant="danger" onPress={() => deleteProgram.mutate(p.id)} />
                  </View>
                </Card>
              ))}
            </View>
          )}
          {myPrograms.length > 0 ? (
            <View style={{ marginTop: spacing[2] }}>
              <Button label="+ Nouveau programme" variant="secondary" onPress={() => router.push('/marketplace/program-builder')} />
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
