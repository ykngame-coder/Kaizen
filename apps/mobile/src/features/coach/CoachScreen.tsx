import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, View, type ScrollView as ScrollViewType } from 'react-native';
import { Badge, Button, Card, Gradient, Input, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { askCoach, SUGGESTED_QUESTIONS, type CoachReply } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { randomId } from '@/lib/id';

interface Message {
  id: string;
  role: 'user' | 'coach';
  text: string;
  reply?: CoachReply;
}

const CONF_TONE: Record<Confidence, BadgeTone> = {
  high: 'success',
  medium: 'info',
  to_confirm: 'warning',
};
const CONF_LABEL: Record<Confidence, string> = {
  high: 'Confiance élevée',
  medium: 'Confiance moyenne',
  to_confirm: 'À confirmer',
};

/** Conversational coach (Master Prompt P6.3, P17.9, P25.10). Deterministic and explainable. */
export function CoachScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const scrollRef = useRef<ScrollViewType>(null);

  // Greeting is built once; live data is used on each ask().
  const greeting = useMemo(
    () => askCoach('help', { activities: [], asOf: new Date().toISOString() }),
    [],
  );
  const [messages, setMessages] = useState<Message[]>([
    { id: 'seed', role: 'coach', text: greeting.text, reply: greeting },
  ]);
  const [draft, setDraft] = useState('');

  const ask = (question: string): void => {
    const q = question.trim();
    if (!q) return;
    const reply = askCoach(q, {
      activities,
      healthMetrics: health,
      asOf: new Date().toISOString(),
    });
    setMessages((prev) => [
      ...prev,
      { id: randomId(), role: 'user', text: q },
      { id: randomId(), role: 'coach', text: reply.text, reply },
    ]);
    setDraft('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing[4], paddingBottom: spacing[2] }}>
        <Text variant="title">Coach IA</Text>
        <Text variant="caption" color="textMuted">
          Ton coach analyse tes données et explique chaque conseil.
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[4], gap: spacing[3] }}
      >
        {messages.map((m) =>
          m.role === 'user' ? (
            <View
              key={m.id}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '85%',
                borderRadius: radii.lg,
                overflow: 'hidden',
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[4],
              }}
            >
              <Gradient fill start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              <Text variant="body" color="onGradient">
                {m.text}
              </Text>
            </View>
          ) : (
            <View key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
              <Card>
                {m.reply?.explanation ? (
                  <>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text variant="label" color="textMuted">
                        OBSERVATION → ANALYSE → ACTION
                      </Text>
                      {m.reply.confidence ? (
                        <Badge
                          label={CONF_LABEL[m.reply.confidence]}
                          tone={CONF_TONE[m.reply.confidence]}
                        />
                      ) : null}
                    </View>
                    <Text variant="caption" color="textMuted">
                      {m.reply.explanation.observation}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {m.reply.explanation.analysis}
                    </Text>
                    <Text variant="body">{m.reply.explanation.action}</Text>
                  </>
                ) : (
                  <Text variant="body">{m.text}</Text>
                )}
              </Card>
            </View>
          ),
        )}

        {/* Quick suggestions */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {(messages[messages.length - 1]?.reply?.followUps ?? SUGGESTED_QUESTIONS).map((q) => (
            <View key={q}>
              <Button label={q} variant="secondary" onPress={() => ask(q)} />
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: spacing[2],
          padding: spacing[4],
          borderTopWidth: 1,
          borderTopColor: colors.border,
          alignItems: 'flex-end',
        }}
      >
        <View style={{ flex: 1 }}>
          <Input
            placeholder="Pose ta question…"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => ask(draft)}
            returnKeyType="send"
          />
        </View>
        <Button label="Envoyer" onPress={() => ask(draft)} />
      </View>
    </Screen>
  );
}
