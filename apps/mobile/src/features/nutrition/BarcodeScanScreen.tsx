import React, { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Barcode scanner (Master Prompt P11). expo-camera is bundled in Expo Go, so
 * this works without a dev build. On the web (no camera pipeline) we fall back
 * to manual entry. A scanned code routes to the food search, which looks it up.
 */
export function BarcodeScanScreen(): React.JSX.Element {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const onScanned = (result: BarcodeScanningResult): void => {
    if (scannedRef.current) return; // fire once
    const code = result.data?.replace(/\D/g, '');
    if (!code) return;
    scannedRef.current = true;
    router.replace(`/food/search?barcode=${code}`);
  };

  if (Platform.OS === 'web') {
    return (
      <Screen scroll>
        <Text variant="title">Scanner un code-barres</Text>
        <Text variant="body" color="textMuted">
          Le scan caméra est disponible sur mobile (Expo Go). Sur le web, saisis le numéro dans la
          recherche d'aliments.
        </Text>
        <Button label="Aller à la recherche" onPress={() => router.replace('/food/search')} />
      </Screen>
    );
  }

  if (!permission) {
    return (
      <Screen>
        <Text variant="body" color="textMuted">
          Préparation de la caméra…
        </Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen scroll>
        <Text variant="title">Autoriser la caméra</Text>
        <Text variant="body" color="textMuted">
          Supotsu a besoin de la caméra pour scanner les codes-barres des aliments. Aucune image
          n'est enregistrée.
        </Text>
        <Button label="Autoriser la caméra" onPress={requestPermission} />
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Saisir le numéro à la place" variant="secondary" onPress={() => router.replace('/food/search')} />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
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
          Vise le code-barres du produit
        </Text>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
