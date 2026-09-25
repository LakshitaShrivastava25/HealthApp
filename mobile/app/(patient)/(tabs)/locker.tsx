import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Badge, Card, EmptyState, ErrorNote, Row, Screen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { documentsApi, unwrap, type UploadFile } from '../../../src/lib/api';
import { pickDocument, pickFromCamera, pickFromLibrary } from '../../../src/lib/pickFile';
import { colors, radius, spacing, type } from '../../../src/theme';

type Doc = {
  id: string;
  title: string;
  category: string;
  status: string;
  document_date: string | null;
  hospital_name: string;
};

const TABS = [
  { label: 'All', value: '' },
  { label: 'Reports', value: 'report' },
  { label: 'Prescriptions', value: 'prescription' },
  { label: 'Scans', value: 'scan' },
  { label: 'Discharge', value: 'discharge' },
];

const categoryTone = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  other: 'neutral',
} as const;

const statusTone = { processed: 'success', needs_review: 'warning', failed: 'danger' } as const;

export default function Locker() {
  const { activeProfile } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState('');
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setError(null);
    try {
      const { data } = await documentsApi.list(activeProfile.id, tab || undefined);
      setDocuments(unwrap<Doc>(data));
    } catch {
      setError("Couldn't load your documents. Pull down to retry.");
    }
  }, [activeProfile, tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function upload(pick: () => Promise<UploadFile | null>) {
    setSheetOpen(false);
    setUploadError(null);
    let file: UploadFile | null = null;
    try {
      file = await pick();
    } catch {
      setUploadError("Couldn't open that picker.");
      return;
    }
    if (!file || !activeProfile) return;

    setUploading(true);
    try {
      // Category follows the tab in view, matching the web app: uploading
      // from the Prescriptions tab files it as a prescription.
      await documentsApi.upload(activeProfile.id, file, tab || 'other');
      await load();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setUploadError(
        status === 500
          ? 'The server could not process that document. This backend cannot structure documents while a Claude API key is configured — see the known issue in the project notes.'
          : "Upload failed. Check your connection and try again."
      );
    } finally {
      setUploading(false);
    }
  }

  const filtered = documents.filter((d) =>
    (d.title ?? '').toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={15} color={colors.ink300} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search documents..."
            placeholderTextColor={colors.ink300}
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setTab(t.value)}
              style={[styles.chip, tab === t.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, tab === t.value && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {!!uploadError && <ErrorNote message={uploadError} />}
        {!!error && <ErrorNote message={error} onRetry={load} />}

        {uploading && (
          <Card>
            <Row>
              <ActivityIndicator color={colors.brandPurple} size="small" />
              <Text style={type.caption}>Uploading and processing…</Text>
            </Row>
          </Card>
        )}

        {!error && filtered.length === 0 && !uploading && (
          <EmptyState
            title={query ? 'Nothing matches that search' : 'No documents here yet'}
            note={
              query
                ? 'Try a different word from the document title.'
                : 'Tap the button below to photograph a prescription or pick a PDF.'
            }
          />
        )}

        {filtered.map((d) => (
          <Card key={d.id} onPress={() => router.push(`/(patient)/document/${d.id}`)}>
            <Row>
              <View style={styles.fileIcon}>
                <Feather name="file-text" size={18} color={colors.brandPurple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.title} numberOfLines={1}>
                  {d.title || 'Untitled document'}
                </Text>
                <Text style={type.micro}>
                  {[d.document_date, d.hospital_name].filter(Boolean).join(' · ') || 'No date recorded'}
                </Text>
                <Row style={{ marginTop: spacing.sm }}>
                  <Badge tone={categoryTone[d.category as keyof typeof categoryTone] ?? 'neutral'}>
                    {d.category}
                  </Badge>
                  <Badge tone={statusTone[d.status as keyof typeof statusTone] ?? 'neutral'}>
                    {d.status.replace('_', ' ')}
                  </Badge>
                </Row>
              </View>
              <Feather name="chevron-right" size={16} color={colors.ink300} />
            </Row>
          </Card>
        ))}

        <Row style={styles.privacyNote}>
          <Feather name="shield" size={16} color={colors.brandPurple} />
          <Text style={[type.caption, { flex: 1 }]}>
            Only you and the doctors you approve can see these documents.
          </Text>
        </Row>
      </Screen>

      <Pressable style={styles.fab} onPress={() => setSheetOpen(true)}>
        <Feather name="plus" size={22} color={colors.white} />
      </Pressable>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={[type.title, { marginBottom: spacing.md }]}>Add a document</Text>
            {[
              { icon: 'camera', label: 'Take a photo', note: 'Photograph a prescription or report', run: pickFromCamera },
              { icon: 'image', label: 'Choose from photos', note: 'Pick an existing image', run: pickFromLibrary },
              { icon: 'file', label: 'Choose a file', note: 'PDF, JPG or PNG', run: pickDocument },
            ].map((option) => (
              <Pressable key={option.label} style={styles.sheetRow} onPress={() => upload(option.run)}>
                <View style={styles.fileIcon}>
                  <Feather name={option.icon as 'camera'} size={17} color={colors.brandPurple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.label}>{option.label}</Text>
                  <Text style={type.micro}>{option.note}</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.ink900 },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  chipTextActive: { color: colors.white },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyNote: {
    backgroundColor: colors.brandLavender,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPurple,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#101828',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,36,48,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
});
