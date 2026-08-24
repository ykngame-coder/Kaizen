import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { addPhoto, loadPhotos, removePhoto, type ProgressPhoto } from '@/lib/progressPhotos';
import { formatDate } from '@/lib/format';

/** Photos d'évolution — capture, gallery, and before/after comparison. Stored locally. */
export function ProgressPhotosScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPhotos().then(setPhotos);
  }, []);

  const pick = async (from: 'camera' | 'library'): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(t('sport.progress.photos.permissionDenied'));
        return;
      }
      const opts = { quality: 0.6, base64: Platform.OS === 'web' } as const;
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const uri = Platform.OS === 'web' && asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setPhotos(await addPhoto(uri));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sport.progress.photos.addPhotoFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1]!, id] : [...prev, id]));
  };

  const del = async (id: string): Promise<void> => {
    setPhotos(await removePhoto(id));
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  // Compare: order the two selected by date (avant = older, après = newer).
  const pair = useMemo(() => {
    if (selected.length !== 2) return null;
    const a = photos.find((p) => p.id === selected[0]);
    const b = photos.find((p) => p.id === selected[1]);
    if (!a || !b) return null;
    return a.dateISO <= b.dateISO ? { before: a, after: b } : { before: b, after: a };
  }, [selected, photos]);

  return (
    <Screen scroll>
      <Text variant="title">{t('sport.progress.photos.title')}</Text>
      <Text variant="caption" color="textSubtle">{t('sport.progress.photos.subtitle')}</Text>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Button label={busy ? '…' : t('sport.progress.photos.capture')} onPress={() => pick('camera')} disabled={busy} />
        <Button label={t('sport.progress.photos.gallery')} variant="secondary" onPress={() => pick('library')} disabled={busy} />
      </View>
      {error ? <Text variant="caption" color="error">{error}</Text> : null}

      {/* Compare */}
      {pair ? (
        <Card>
          <Text variant="heading">{t('sport.progress.photos.compareHeading')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
            {[{ p: pair.before, tag: t('sport.progress.photos.tagBefore') }, { p: pair.after, tag: t('sport.progress.photos.tagAfter') }].map(({ p, tag }) => (
              <View key={p.id} style={{ flex: 1 }}>
                <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated }} resizeMode="cover" />
                <Text variant="caption" style={{ fontWeight: '700', marginTop: spacing[1] }}>{tag}</Text>
                <Text variant="caption" color="textSubtle">{formatDate(p.dateISO)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : selected.length === 1 ? (
        <Text variant="caption" color="textMuted">{t('sport.progress.photos.selectSecond')}</Text>
      ) : null}

      {/* Grid */}
      {photos.length === 0 ? (
        <EmptyState icon={<Icon name="camera" size={44} color={colors.textSubtle} />} title={t('sport.progress.photos.emptyTitle')} message={t('sport.progress.photos.emptyMessage')} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          {photos.map((p) => {
            const isSel = selected.includes(p.id);
            return (
              <Pressable key={p.id} onPress={() => toggle(p.id)} style={{ width: '47%' }}>
                <View style={{ borderRadius: radii.lg, borderWidth: isSel ? 2 : 0, borderColor: colors.primary, overflow: 'hidden' }}>
                  <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.surfaceElevated }} resizeMode="cover" />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[1] }}>
                  <Text variant="caption" color="textSubtle">{formatDate(p.dateISO)}</Text>
                  <Pressable onPress={() => del(p.id)} hitSlop={8}><Text variant="caption" color="error">{t('sport.progress.photos.deleteAction')}</Text></Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
