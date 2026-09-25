import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { doctorAccessApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

type Grant = {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked' | 'expired';
  requested_at: string;
  doctor_detail: { full_name: string; specialization: string; clinic_name: string } | null;
};

export default function DoctorAccess() {
  const { activeProfile } = useAuth();

  const [grants, setGrants] = useState<Grant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setError(null);
    try {
      const { data } = await doctorAccessApi.listForProfile(activeProfile.id);
      setGrants(unwrap<Grant>(data));
    } catch {
      setError("Couldn't load access requests. Pull down to retry.");
    }
  }, [activeProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function respond(id: string, action: 'approve' | 'deny' | 'revoke') {
    setActing(id);
    try {
      if (action === 'approve') await doctorAccessApi.approve(id);
      else if (action === 'deny') await doctorAccessApi.deny(id);
      else await doctorAccessApi.revoke(id);
      await load();
    } catch {
      setError("Couldn't record that decision. Please try again.");
    } finally {
      setActing(null);
    }
  }

  function confirmRevoke(grant: Grant) {
    Alert.alert(
      'Revoke access?',
      `Dr. ${grant.doctor_detail?.full_name ?? 'This doctor'} will immediately lose access to these records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => respond(grant.id, 'revoke') },
      ]
    );
  }

  const pending = grants.filter((g) => g.status === 'pending');
  const approved = grants.filter((g) => g.status === 'approved');
  const past = grants.filter((g) => ['denied', 'revoked', 'expired'].includes(g.status));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      <Card>
        <CardHeader
          title="Your patient reference ID"
          subtitle="Give this to a doctor so they can request access. They see nothing until you approve."
        />
        <View style={styles.idBox}>
          <Text style={styles.idText} selectable numberOfLines={2}>
            {activeProfile?.id}
          </Text>
        </View>
        <Button
          variant="secondary"
          onPress={async () => {
            if (!activeProfile) return;
            await Clipboard.setStringAsync(activeProfile.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied' : 'Copy reference ID'}
        </Button>
      </Card>

      <Card>
        <CardHeader title="Pending requests" subtitle="Nothing is shared without your approval" />
        {pending.length === 0 ? (
          <Text style={type.caption}>No pending requests right now.</Text>
        ) : (
          pending.map((g) => (
            <View key={g.id} style={styles.grantRow}>
              <Row style={{ marginBottom: spacing.md }}>
                <View style={styles.docIcon}>
                  <Feather name="user" size={16} color={colors.brandPurple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.label}>Dr. {g.doctor_detail?.full_name ?? 'Unknown doctor'}</Text>
                  <Text style={type.micro}>
                    {[g.doctor_detail?.specialization, g.doctor_detail?.clinic_name]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </Row>
              <Row style={{ gap: spacing.sm }}>
                <Button
                  style={{ flex: 1 }}
                  onPress={() => respond(g.id, 'approve')}
                  loading={acting === g.id}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={() => respond(g.id, 'deny')}
                  disabled={acting === g.id}
                >
                  Deny
                </Button>
              </Row>
            </View>
          ))
        )}
      </Card>

      <Card>
        <CardHeader title="Doctors with access" subtitle="Revoke at any time" />
        {approved.length === 0 ? (
          <EmptyState
            title="No doctors have access"
            note="Share your reference ID above with a doctor to get started."
          />
        ) : (
          approved.map((g) => (
            <Row key={g.id} style={styles.approvedRow}>
              <View style={[styles.docIcon, { backgroundColor: colors.successBg }]}>
                <Feather name="user-check" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>Dr. {g.doctor_detail?.full_name ?? 'Unknown doctor'}</Text>
                <Text style={type.micro}>{g.doctor_detail?.specialization}</Text>
              </View>
              <Pressable onPress={() => confirmRevoke(g)} disabled={acting === g.id}>
                <Text style={styles.revokeText}>Revoke</Text>
              </Pressable>
            </Row>
          ))
        )}
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader title="Past requests" />
          {past.map((g) => (
            <Row key={g.id} style={{ justifyContent: 'space-between', paddingVertical: spacing.sm }}>
              <Text style={type.caption}>Dr. {g.doctor_detail?.full_name ?? 'Unknown doctor'}</Text>
              <Badge tone={g.status === 'denied' ? 'danger' : 'neutral'}>{g.status}</Badge>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  idBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  idText: { fontSize: 12, color: colors.ink900, fontFamily: undefined },
  grantRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  approvedRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeText: { fontSize: 13, fontWeight: '600', color: colors.danger },
});
