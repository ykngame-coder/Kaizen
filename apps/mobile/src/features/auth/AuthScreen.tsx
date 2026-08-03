import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { Link } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Button, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useAuth } from './AuthProvider';
import { credentialsSchema, type Credentials } from './authSchema';
import type { OAuthProvider } from './authClient';
import appIcon from '../../../assets/icon.png';

type Mode = 'signIn' | 'signUp';

const COPY: Record<
  Mode,
  { title: string; cta: string; alt: string; altHref: string; altLabel: string }
> = {
  signIn: {
    title: 'Content de te revoir',
    cta: 'Se connecter',
    alt: 'Pas encore de compte ?',
    altHref: '/(auth)/sign-up',
    altLabel: 'Créer un compte',
  },
  signUp: {
    title: 'Bienvenue sur Kaizen Supotsu',
    cta: 'Créer un compte',
    alt: 'Déjà un compte ?',
    altHref: '/(auth)/sign-in',
    altLabel: 'Se connecter',
  },
};

/** Shared sign-in / sign-up screen (Master Prompt P17.2 écran 1). */
export function AuthScreen({ mode }: { mode: Mode }): React.JSX.Element {
  const { signIn, signUp, signInWithOAuth, mode: authMode } = useAuth();
  const { colors } = useTheme();
  const copy = COPY[mode];
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    setInfo(null);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setInfo('Compte créé — confirme ton adresse e-mail, puis connecte-toi.');
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Une erreur est survenue');
    }
  });

  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const onOAuthPress = async (provider: OAuthProvider): Promise<void> => {
    setSubmitError(null);
    setInfo(null);
    setOauthPending(provider);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setOauthPending(null);
    }
  };

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', gap: spacing[2], marginTop: spacing[8] }}>
        <Image source={appIcon} style={{ width: 88, height: 88, borderRadius: 22 }} />
        <Text variant="display">Kaizen Supotsu</Text>
        <Text variant="caption" color="textSubtle">
          Progresser aujourd'hui, être meilleur demain.
        </Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>
          {copy.title}
        </Text>
      </View>

      {authMode === 'demo' ? (
        <Badge label="Mode démo — backend non connecté" tone="warning" />
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Input
            label="E-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Input
            label="Mot de passe"
            secureTextEntry
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      {submitError ? (
        <Text variant="caption" style={{ color: colors.error }}>
          {submitError}
        </Text>
      ) : null}

      {info ? <Badge label={info} tone="success" /> : null}

      <Button
        label={formState.isSubmitting ? '…' : copy.cta}
        onPress={onSubmit}
        disabled={formState.isSubmitting}
        fullWidth
      />

      <View style={{ gap: spacing[2] }}>
        <Button
          label={oauthPending === 'apple' ? '…' : 'Continuer avec Apple'}
          variant="secondary"
          fullWidth
          disabled={oauthPending !== null}
          onPress={() => onOAuthPress('apple')}
        />
        <Button
          label={oauthPending === 'google' ? '…' : 'Continuer avec Google'}
          variant="secondary"
          fullWidth
          disabled={oauthPending !== null}
          onPress={() => onOAuthPress('google')}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[2], justifyContent: 'center' }}>
        <Text variant="caption" color="textMuted">
          {copy.alt}
        </Text>
        <Link href={copy.altHref}>
          <Text variant="caption" color="primary">
            {copy.altLabel}
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
