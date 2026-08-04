import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font } from '../theme';

function Chevron({ delay = 0 }) {
  const shift = useSharedValue(0);
  const fade = useSharedValue(0.3);

  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    shift.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(10, { duration: 550, easing: ease }),
        withTiming(0, { duration: 400, easing: ease }),
      ),
      -1,
      false
    ));
    fade.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 275, easing: ease }),
        withTiming(0.3, { duration: 275, easing: ease }),
      ),
      -1,
      false
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }],
    opacity: fade.value,
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Animated.View>
  );
}

export function SwipeHint({ label = 'Swipe to continue' }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(300, withTiming(1, { duration: 500 }));
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.wrap, wrapStyle]} pointerEvents="none">
      <Text style={styles.label}>{label}</Text>
      <Chevron delay={0} />
      <Chevron delay={120} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: String(font.medium),
    color: colors.textSecondary,
    letterSpacing: 0.3,
    marginRight: spacing.xs,
  },
});
