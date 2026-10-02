import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import useNotifications, { type AppNotification } from '../hooks/useNotifications';
import { colors, radius, spacing, type } from '../theme';

/**
 * Header bell for the patient app: a count badge plus a bottom sheet listing
 * what needs attention. Tapping an item jumps to the document or to Doctor
 * Access. Mirrors the web Topbar bell.
 */
export default function NotificationBell() {
  const { notifications, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const count = notifications.length;

  function openItem(n: AppNotification) {
    setOpen(false);
    router.push(n.href);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          refresh();
          setOpen(true);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        style={({ pressed }) => [styles.bell, pressed && { opacity: 0.7 }]}
      >
        <Feather name="bell" size={19} color={colors.ink700} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={type.h2}>Notifications</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.ink500} />
              </Pressable>
            </View>
            {count === 0 ? (
              <View style={styles.empty}>
                <Feather name="check-circle" size={22} color={colors.success} />
                <Text style={type.caption}>You're all caught up.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {notifications.map((n, i) => (
                  <NotificationRow key={n.id} item={n} last={i === count - 1} onPress={() => openItem(n)} />
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** One notification line — shared with the Dashboard so both read the same. */
export function NotificationRow({
  item,
  last,
  onPress,
}: {
  item: AppNotification;
  last?: boolean;
  onPress: () => void;
}) {
  const warning = item.tone === 'warning';
  const icon = item.kind === 'access' ? 'user-plus' : warning ? 'alert-circle' : 'loader';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.iconTile, { backgroundColor: warning ? colors.warningBg : colors.infoBg }]}>
        <Feather name={icon} size={16} color={warning ? colors.warning : colors.info} />
      </View>
      <Text style={styles.rowText} numberOfLines={2}>
        {item.text}
      </Text>
      <Feather name="chevron-right" size={16} color={colors.ink300} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,36,48,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink900 },
});
