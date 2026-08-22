import React, { useCallback, useState } from 'react';
import {
  FlatList,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { useTheme } from './theme';

export interface CarouselProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  /** Width, in px, of the neighbouring card visible at rest on each side. */
  peek?: number;
  /** Space between cards. */
  gap?: number;
  showDots?: boolean;
  onIndexChange?: (index: number) => void;
  initialIndex?: number;
}

/**
 * Generic swipeable card carousel — peek effect + page dots, no external deps
 * (FlatList only). Content-agnostic: renderItem supplies the card, this only
 * owns layout/paging. Page tracked on scroll settle (onMomentumScrollEnd)
 * rather than every scroll frame, so it doesn't re-render mid-gesture.
 */
export function Carousel<T>({
  data,
  renderItem,
  keyExtractor,
  peek = 24,
  gap = spacing[3],
  showDots = true,
  onIndexChange,
  initialIndex = 0,
}: CarouselProps<T>): React.JSX.Element {
  const { colors } = useTheme();
  // Measures its own container instead of the window: the caller may embed
  // this inside an already-padded screen, in which case the peek should
  // reveal neighbours within that space, not overflow past it.
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width), []);
  const cardWidth = Math.max(0, containerWidth - peek * 2 - gap);
  const snapInterval = cardWidth + gap;
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(data.length - 1, 0)));

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / snapInterval);
      const clamped = Math.max(0, Math.min(data.length - 1, next));
      setIndex((prev) => {
        if (clamped === prev) return prev;
        onIndexChange?.(clamped);
        return clamped;
      });
    },
    [snapInterval, data.length, onIndexChange],
  );

  return (
    <View onLayout={onLayout}>
      {containerWidth > 0 ? (
        <FlatList
          data={data}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={snapInterval}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: peek, alignItems: 'flex-start' }}
          keyExtractor={keyExtractor ?? ((_, i) => String(i))}
          onMomentumScrollEnd={handleMomentumEnd}
          renderItem={({ item, index: i }: ListRenderItemInfo<T>) => (
            <View style={{ width: cardWidth, marginRight: i === data.length - 1 ? 0 : gap }}>
              {renderItem(item, i)}
            </View>
          )}
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 1, max: data.length, now: index + 1 }}
        />
      ) : null}
      {showDots && data.length > 1 ? (
        <View
          accessibilityRole="tablist"
          style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing[1], marginTop: spacing[3] }}
        >
          {data.map((_, i) => (
            <View
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Page ${i + 1} sur ${data.length}`}
              accessibilityState={{ selected: i === index }}
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                borderRadius: radii.full,
                backgroundColor: i === index ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
