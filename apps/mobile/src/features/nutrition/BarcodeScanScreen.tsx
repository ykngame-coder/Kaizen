import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Barcode scanner (Master Prompt P11). expo-camera is bundled in Expo Go, so
 * this works without a dev build. On the web (no camera pipeline) we fall back
 * to manual entry. A scanned code routes to the food search, which looks it up.
 */
export function BarcodeScanScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  // expo-camera's iOS preview doesn't re-initialise reliably under the new
  // architecture (expo/expo#31597) — the view mounts but the capture session
  // never starts, leaving a blank screen with no camera image at all. Bumping
  // this key on every focus forces a fresh CameraView mount each time the
  // screen is opened, which does start the session.
  const [mountKey, setMountKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      scannedRef.current = false;
      setMountKey((k) => k + 1);
    }, []),
  );

  const onScanned = (result: BarcodeScanningResult): void => {
    if (scannedRef.current) return; // fire once
    const code = result.data?.replace(/\D/g, '');
    if (!code) return;
    scannedRef.current = true;
    router.replace(`/nutrition/food/search?barcode=${code}`);
  };

  if (Platform.OS === 'web') {
    return (
      <Screen scroll>
        <Text variant="title">{t('nutrition.barcodeScan.webTitle')}</Text>
        <Text variant="body" color="textMuted">
          {t('nutrition.barcodeScan.webBody')}
        </Text>
        <Button label={t('nutrition.barcodeScan.goToSearch')} onPress={() => router.replace('/nutrition/food/search')} />
      </Screen>
    );
  }

  if (!permission) {
    return (
      <Screen>
        <Text variant="body" color="textMuted">
          {t('nutrition.barcodeScan.preparingCamera')}
        </Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen scroll>
        <Text variant="title">{t('nutrition.barcodeScan.allowCameraTitle')}</Text>
        <Text variant="body" color="textMuted">
          {t('nutrition.barcodeScan.allowCameraBody')}
        </Text>
        <Button label={t('nutrition.barcodeScan.allowCameraButton')} onPress={requestPermission} />
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={t('nutrition.barcodeScan.enterManually')} variant="secondary" onPress={() => router.replace('/nutrition/food/search')} />
        </View>
      </Screen>
    );
  }

  return (
    // Explicit black ground: this is the one screen that doesn't use <Screen>,
    // so without it the navigator's own (light) background shows through
    // wherever the preview doesn't paint.
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        key={mountKey}
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={onScanned}
      />
      <View
        style={{
          position: 'absolute',
          bottom: spacing[8],
          left: spacing[4],
          right: spacing[4],
          gap: spacing[2],
        }}
      >
        <Text variant="body" style={{ color: '#fff', textAlign: 'center' }}>
          {t('nutrition.barcodeScan.aimHint')}
        </Text>
        <Button label={t('nutrition.barcodeScan.cancelButton')} variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
