import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Badge, Card, EmptyState, ErrorNote, Row, Screen, Loading } from '../../../src/components/ui';
import { UploadStatusCard, useUploadStatus } from '../../../src/components/UploadStatus';
import { useAuth } from '../../../src/context/AuthContext';
import { documentsApi, unwrap, type UploadFile } from '../../../src/lib/api';
import { pickDocument, pickFromCamera, pickFromLibrary, type PickOptions } from '../../../src/lib/pickFile';
import { colors, radius, spacing, type } from '../../../src/theme';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';

type Doc = {
  id: string;
  title: string;
  category: string;
  status: string;
  document_date: string | null;
  hospital_name: string;
  copies?: { id: string }[];
  possible_duplicate?: { id: string } | null;
};

const TABS = [
  { label: 'All', value: '' },
  { label: 'Reports', value: 'report' },
  { label: 'Prescriptions', value: 'prescription' },
  { label: 'Scans', value: 'scan' },
  { label: 'Discharge', value: 'discharge' },
  { label: 'Other', value: 'other' },
];

const categoryTone = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  other: 'neutral',
} as const;

const statusTone = {
  processed: 'success',
  needs_review: 'warning',
  processing: 'info',
  failed: 'danger',
} as const;

// A new upload lands as "processing" while the server reads it in the
// background; the list refreshes itself until that settles, instead of
// showing "processing" until the person thinks to pull down.
const PROCESSING_POLL_MS = 5_000;
const PROCESSING_POLL_LIMIT_MS = 3 * 60_000;

// iOS will not present the camera or a picker while a Modal is still
// animating away — the tap silently does nothing. Wait out the sheet's
// slide-down first.
const SHEET_CLOSE_MS = Platform.OS === 'ios' ? 450 : 80;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Locker() {
  const { activeProfile } = useAuth();
  const profileId = activeProfile?.id ?? null;
  const router = useRouter();

  const [tab, setTab] = useState('');
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  // False until the first load finishes: a loader, not "nothing here yet".
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const uploadStatus = useUploadStatus();
  const uploading = uploadStatus.busy;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    setError(null);
    try {
      const { data } = await documentsApi.list(profileId, tab || undefined);
      setDocuments(unwrap<Doc>(data));
    } catch {
      setError("Couldn't load your documents. Pull down to retry.");
    } finally {
      setLoaded(true);
    }
  }, [profileId, tab]);

  // Not on every tab switch: see useFocusRefresh.
  useFocusRefresh(load, profileId ? `locker:${profileId}:${tab}` : null);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Keep refreshing while anything is still being read by the server.
  const hasProcessing = documents.some((d) => d.status === 'processing');
  useFocusEffect(
    useCallback(() => {
      if (!hasProcessing) return;
      const started = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - started > PROCESSING_POLL_LIMIT_MS) {
          clearInterval(timer);
          return;
        }
        void load();
      }, PROCESSING_POLL_MS);
      return () => clearInterval(timer);
    }, [hasProcessing, load])
  );

  async function upload(pick: (options?: PickOptions) => Promise<UploadFile | null>) {
    if (uploading) return;
    setSheetOpen(false);
    setUploadError(null);
    setUploadNotice(null);
    await wait(SHEET_CLOSE_MS);
    let file: UploadFile | null = null;
    try {
      file = await pick({ onPicked: uploadStatus.preparing });
    } catch {
      uploadStatus.reset();
      setUploadError("Couldn't open that picker.");
      return;
    }
    if (!file || !activeProfile) {
      uploadStatus.reset();
      return;
    }

    uploadStatus.uploading();
    try {
      // Category follows the tab in view, matching the web app: uploading
      // from the Prescriptions tab files it as a prescription.
      const { data } = await documentsApi.upload(activeProfile.id, file, tab || 'other', uploadStatus.onProgress);
      uploadStatus.done();
      await load();
      if (data?.upload?.outcome === 'exact_duplicate') {
        // The same file (under any name) is already in the locker: nothing
        // was added or processed again.
        setUploadNotice(data.upload.message);
      } else if (data?.duplicate_of) {
        setUploadNotice(
          'This is a copy of a prescription already in your locker (same text on every page). It was kept with the original and not counted twice.'
        );
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // Uploads wait for processing, so a slow connection can time out even
      // though the file arrived. Retrying is safe: the same file is
      // recognised and never added twice.
      setUploadError(
        status === 500
          ? 'Upload failed on the server. Please try again.'
          : "The upload didn't finish. Check your connection and try again — if it did arrive, it won't be added twice."
      );
      void load();
    } finally {
      uploadStatus.reset();
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
        {!!uploadNotice && (
          <Card>
            <Row>
              <Feather name="info" size={16} color={colors.info} />
              <Text style={[type.caption, { flex: 1, color: colors.ink700 }]}>{uploadNotice}</Text>
              <Pressable onPress={() => setUploadNotice(null)} hitSlop={10}>
                <Feather name="x" size={15} color={colors.ink300} />
              </Pressable>
            </Row>
          </Card>
        )}
        {!!error && <ErrorNote message={error} onRetry={load} />}

        <UploadStatusCard
          stage={uploadStatus.stage}
          progress={uploadStatus.progress}
          copy={{
            preparing: 'Preparing your file…',
            uploading: 'Uploading your document…',
            processing: 'Upload complete — saving it to your locker…',
            done: 'Uploaded — it will be read in a moment',
            note: 'Please keep the app open until this finishes.',
          }}
        />

        {!loaded && !error && <Loading />}
        {loaded && !error && filtered.length === 0 && !uploading && (
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
                <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  <Badge tone={categoryTone[d.category as keyof typeof categoryTone] ?? 'neutral'}>
                    {d.category}
                  </Badge>
                  <Badge tone={statusTone[d.status as keyof typeof statusTone] ?? 'neutral'}>
                    {d.status.replace(/_/g, ' ')}
                  </Badge>
                  {!!d.copies?.length && (
                    <Badge tone="info">{`+${d.copies.length} cop${d.copies.length === 1 ? 'y' : 'ies'}`}</Badge>
                  )}
                  {!!d.possible_duplicate && <Badge tone="warning">possible duplicate</Badge>}
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

      {/* While an upload runs the button itself spins, so the upload is
          visible even with the progress card scrolled out of view. */}
      <Pressable
        style={[styles.fab, uploading && { opacity: 0.75 }]}
        disabled={uploading}
        onPress={() => setSheetOpen(true)}
        accessibilityLabel={uploading ? 'Uploading a document' : 'Add a document'}
        accessibilityState={{ busy: uploading, disabled: uploading }}
      >
        {uploading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Feather name="plus" size={22} color={colors.white} />
        )}
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
