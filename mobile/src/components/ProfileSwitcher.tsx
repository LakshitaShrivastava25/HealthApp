import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth, type Profile } from '../context/AuthContext';
import { colors, radius, spacing, type } from '../theme';

/**
 * Which family member the patient screens are currently showing.
 *
 * This is the single most important control in the patient app and it has
 * no real equivalent on the web sidebar, so it lives in the header where
 * it is visible from every screen: every record in the system is scoped to
 * a profile, and showing one person's medicines under another's name would
 * be a genuine safety problem rather than a cosmetic one.
 */
export default function ProfileSwitcher({ variant = 'plain' }: { variant?: 'plain' | 'pill' }) {
  const { profiles, activeProfile, setActiveProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!activeProfile) return null;

  const onlyOne = profiles.length <= 1;

  return (
    <>
      <Pressable
        // The header pill opens the profile page (which also switches family
        // members); the plain trigger keeps the quick-switch sheet.
        onPress={() => (variant === 'pill' ? router.push('/(patient)/profile') : !onlyOne && setOpen(true))}
        style={({ pressed }) => [
          styles.trigger,
          variant === 'pill' && styles.pill,
          pressed && (variant === 'pill' || !onlyOne) && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.avatar, variant === 'pill' && styles.avatarActive]}>
          <Text style={[styles.avatarText, variant === 'pill' && { color: colors.white }]}>
            {activeProfile.initials}
          </Text>
          {variant === 'pill' && <View style={styles.onlineDot} />}
        </View>
        <View style={{ maxWidth: variant === 'pill' ? 96 : 130 }}>
          <Text numberOfLines={1} style={styles.name}>
            {variant === 'pill' ? activeProfile.full_name.split(' ')[0] : activeProfile.full_name}
          </Text>
          <Text numberOfLines={1} style={[type.micro, { textTransform: 'capitalize' }]}>
            {activeProfile.relation}
          </Text>
        </View>
        {variant === 'pill' ? (
          <Feather name="chevron-right" size={15} color={colors.ink500} />
        ) : (
          !onlyOne && <Feather name="chevron-down" size={15} color={colors.ink500} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={[type.title, { marginBottom: spacing.md }]}>Viewing records for</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {profiles.map((p: Profile) => {
                const isActive = p.id === activeProfile.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setActiveProfile(p);
                      setOpen(false);
                    }}
                    style={[styles.option, isActive && styles.optionActive]}
                  >
                    <View style={[styles.avatar, isActive && styles.avatarActive]}>
                      <Text style={[styles.avatarText, isActive && { color: colors.white }]}>
                        {p.initials}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.label}>{p.full_name}</Text>
                      <Text style={type.micro}>{p.relation}</Text>
                    </View>
                    {isActive && <Feather name="check" size={16} color={colors.brandPurple} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: {
    backgroundColor: colors.brandLavender,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: spacing.md,
    paddingVertical: 4,
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.brandLavender,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { backgroundColor: colors.brandPurple },
  avatarText: { fontSize: 12, fontWeight: '700', color: colors.brandPurple },
  name: { fontSize: 13, fontWeight: '600', color: colors.ink900 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,36,48,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.brandLavender },
});
