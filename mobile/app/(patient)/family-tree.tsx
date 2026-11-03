import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorNote, Loading, Row, Screen, SectionTitle } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { familyApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';

type TreeNode = {
  id: string;
  name: string;
  relation: string;
  initials: string;
  phone_number: string;
  phone_verified: boolean;
  gender: string;
  date_of_birth: string | null;
  blood_group: string;
};

type LinkRequest = {
  id: string;
  from_account_phone: string;
  from_profile_name: string;
  to_phone: string;
  relation: string;
  profile_data: Record<string, string>;
  status: string;
  created_at: string;
};

const RELATION_COLORS: Record<string, { bg: string; text: string }> = {
  self: { bg: colors.brandPurple, text: '#fff' },
  father: { bg: '#dbeafe', text: '#1e40af' },
  mother: { bg: '#fce7f3', text: '#9d174d' },
  spouse: { bg: '#f3e8ff', text: '#7c3aed' },
  son: { bg: '#dcfce7', text: '#166534' },
  daughter: { bg: '#fef3c7', text: '#92400e' },
  other: { bg: colors.surface, text: colors.ink700 },
};

export default function FamilyTreeScreen() {
  const { refreshProfiles } = useAuth();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<LinkRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [treeRes, recvRes, sentRes] = await Promise.all([
        familyApi.tree(),
        familyApi.linkRequests('received'),
        familyApi.linkRequests('sent'),
      ]);
      const tree = treeRes.data;
      setNodes(tree.nodes);
      setSelfId(tree.self_id);
      const recv = recvRes.data.results ?? recvRes.data;
      setRequests(Array.isArray(recv) ? recv : []);
      const sent = sentRes.data.results ?? sentRes.data;
      setSentRequests(Array.isArray(sent) ? sent : []);
    } catch {
      setError("Couldn't load family tree. Pull down to retry.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusRefresh(load, 'family-tree');

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleRespond(id: string, action: 'approve' | 'deny') {
    setResponding(id);
    try {
      await familyApi.respondToRequest(id, action);
      await load();
      if (action === 'approve') await refreshProfiles();
    } catch {
      Alert.alert('Error', `Could not ${action} this request.`);
    } finally {
      setResponding(null);
    }
  }

  const selfNode = nodes.find((n) => n.id === selfId);
  const parents = nodes.filter((n) => n.relation === 'father' || n.relation === 'mother');
  const spouseNodes = nodes.filter((n) => n.relation === 'spouse');
  const childrenNodes = nodes.filter((n) => n.relation === 'son' || n.relation === 'daughter');
  const otherNodes = nodes.filter((n) => n.relation === 'other');
  const pendingReceived = requests.filter((r) => r.status === 'pending');
  const pendingSent = sentRequests.filter((r) => r.status === 'pending');

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}
      {!loaded && !error && <Loading />}

      {/* Pending approval requests */}
      {pendingReceived.length > 0 && (
        <Card style={styles.approvalCard}>
          <Row style={{ marginBottom: spacing.sm }}>
            <Feather name="user-check" size={16} color={colors.warning} />
            <Text style={[type.label, { marginLeft: spacing.sm }]}>Pending approval requests</Text>
          </Row>
          {pendingReceived.map((r) => (
            <View key={r.id} style={styles.requestRow}>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>{r.from_profile_name}</Text>
                <Text style={type.micro}>
                  Wants to add you as <Text style={{ fontWeight: '600', textTransform: 'capitalize' }}>{r.relation}</Text>
                </Text>
                <Text style={[type.micro, { color: colors.ink300 }]}>From: {r.from_account_phone}</Text>
              </View>
              <Row style={{ gap: spacing.sm }}>
                <Pressable
                  onPress={() => handleRespond(r.id, 'approve')}
                  disabled={responding === r.id}
                  style={styles.approveBtn}
                >
                  <Feather name="check" size={14} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => handleRespond(r.id, 'deny')}
                  disabled={responding === r.id}
                  style={styles.denyBtn}
                >
                  <Feather name="x" size={14} color={colors.ink500} />
                </Pressable>
              </Row>
            </View>
          ))}
        </Card>
      )}

      {/* Pending sent requests */}
      {pendingSent.length > 0 && (
        <Card>
          <Row style={{ marginBottom: spacing.sm }}>
            <Feather name="clock" size={16} color={colors.ink500} />
            <Text style={[type.label, { marginLeft: spacing.sm }]}>Awaiting approval</Text>
          </Row>
          {pendingSent.map((r) => (
            <View key={r.id} style={styles.sentRow}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarSmallText}>
                  {(r.profile_data.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>{r.profile_data.full_name}</Text>
                <Text style={type.micro}>Waiting for {r.to_phone} to approve</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Family tree */}
      {loaded && nodes.length === 0 ? (
        <EmptyState title="No family members yet" note="Add family members from the profile switcher." />
      ) : loaded && (
        <View style={styles.tree}>
          {/* Parents */}
          {parents.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Parents</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodeRow}>
                {parents.map((n) => <NodeCard key={n.id} node={n} />)}
              </ScrollView>
              <View style={styles.connector} />
            </>
          )}

          {/* Self + Spouse */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodeRow}>
            {selfNode && <NodeCard node={selfNode} isSelf />}
            {spouseNodes.length > 0 && (
              <>
                <View style={styles.hLine} />
                {spouseNodes.map((n) => <NodeCard key={n.id} node={n} />)}
              </>
            )}
          </ScrollView>

          {/* Children */}
          {childrenNodes.length > 0 && (
            <>
              <View style={styles.connector} />
              <Text style={styles.sectionLabel}>Children</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodeRow}>
                {childrenNodes.map((n) => <NodeCard key={n.id} node={n} />)}
              </ScrollView>
            </>
          )}

          {/* Others */}
          {otherNodes.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Other</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodeRow}>
                {otherNodes.map((n) => <NodeCard key={n.id} node={n} />)}
              </ScrollView>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function NodeCard({ node, isSelf }: { node: TreeNode; isSelf?: boolean }) {
  const c = RELATION_COLORS[node.relation] || RELATION_COLORS.other;
  return (
    <View style={[styles.nodeCard, isSelf && styles.nodeCardSelf]}>
      <View style={[styles.avatar, { backgroundColor: c.bg }]}>
        <Text style={[styles.avatarText, { color: c.text }]}>{node.initials}</Text>
      </View>
      <Text style={styles.nodeName} numberOfLines={1}>{node.name}</Text>
      <Text style={styles.nodeRelation}>{node.relation}</Text>
      {!!node.phone_number && (
        <Row style={{ gap: 3, marginTop: 2 }}>
          <Text style={styles.nodePhone}>{node.phone_number}</Text>
          {node.phone_verified && <Feather name="check-circle" size={10} color="#22c55e" />}
        </Row>
      )}
      {!!node.blood_group && (
        <View style={styles.bloodTag}>
          <Text style={styles.bloodText}>{node.blood_group}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  approvalCard: {
    borderWidth: 1,
    borderColor: '#fbbf2440',
    backgroundColor: '#fbbf2410',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
  },
  approveBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brandPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: { fontSize: 12, fontWeight: '700', color: colors.ink500 },
  tree: { marginTop: spacing.md },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.ink300,
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  nodeRow: { gap: spacing.md, paddingBottom: spacing.xs },
  connector: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  hLine: {
    width: 24,
    height: 2,
    backgroundColor: colors.brandPurple,
    alignSelf: 'center',
  },
  nodeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minWidth: 130,
    maxWidth: 170,
  },
  nodeCardSelf: {
    borderColor: colors.brandPurple + '60',
    backgroundColor: colors.brandPurple + '08',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700' },
  nodeName: { marginTop: spacing.sm, fontSize: 13, fontWeight: '600', color: colors.ink900, textAlign: 'center' },
  nodeRelation: { fontSize: 11, color: colors.ink500, textTransform: 'capitalize' },
  nodePhone: { fontSize: 10, color: colors.ink300 },
  bloodTag: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  bloodText: { fontSize: 10, color: colors.ink500 },
});
