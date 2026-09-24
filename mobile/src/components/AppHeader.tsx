import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import BeatingHeart from './BeatingHeart';
import ProfileSwitcher from './ProfileSwitcher';

/**
 * Header for the patient tabs: beating brand mark, the screen's name under
 * a small "CurePath" kicker, and the family-profile switcher as a pill.
 * Replaces the stock navigator header, which had no room for the brand.
 */
export default function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <BeatingHeart size={38} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.kicker}>CurePath</Text>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>
        <ProfileSwitcher variant="pill" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brandPurple,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink900, marginTop: 1 },
});
