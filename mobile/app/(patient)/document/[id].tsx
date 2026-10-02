import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import DateField, { toIsoDate } from '../../../src/components/DateField';
import { Badge, Button, Card, CardHeader, ErrorNote, Input, Loading, Row, Screen } from '../../../src/components/ui';
import { documentsApi } from '../../../src/lib/api';
import { absoluteUrl } from '../../../src/lib/config';
import { colors, radius, spacing, type } from '../../../src/theme';

type Doc = {
  id: string;
  title: string;
  category: string;
  status: string;
  doctor_name: string;
  hospital_name: string;
  document_date: string | null;
  file: string | null;
  structured_data: Record<string, unknown>;
  uploaded_at: string;
};

const statusTone = {
  processed: 'success',
  needs_review: 'warning',
  processing: 'info',
  failed: 'danger',
} as const;

/** The real Document.Category values, same set as the website's review form. */
const CATEGORIES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'report', label: 'Report' },
  { value: 'scan', label: 'Scan' },
  { value: 'discharge', label: 'Discharge Summary' },
  { value: 'other', label: 'Other' },
];

const POLL_MS = 4000;

type ReviewForm = {
  title: string;
  category: string;
  document_date: string;
  hospital_name: string;
  doctor_name: string;
};

type FieldErrors = Partial<Record<keyof ReviewForm, string>>;

const REVIEW_KEYS: (keyof ReviewForm)[] = ['title', 'category', 'document_date', 'hospital_name', 'doctor_name'];

/**
 * Seeds the review form from the saved record, falling back to the AI's
 * suggestion in structured_data where the real column is blank (same rule as
 * the website). A future date is never seeded: the picker caps at today and
 * the server rejects it, so prefilling one would be a dead end.
 */
function seedReview(d: Doc): ReviewForm {
  const sd = (d.structured_data || {}) as Record<string, unknown>;
  const fromAi = (k: string) => (typeof sd[k] === 'string' ? (sd[k] as string) : '');
  const suggestedDate = d.document_date || fromAi('document_date') || '';
  return {
    title: d.title || fromAi('title'),
    category: d.category || fromAi('category') || 'other',
    document_date: suggestedDate && suggestedDate > toIsoDate(new Date()) ? '' : suggestedDate,
    hospital_name: d.hospital_name || fromAi('hospital_name'),
    doctor_name: d.doctor_name || fromAi('doctor_name'),
  };
}

/** Splits a DRF error body into per-field messages and one general message. */
function parseServerError(err: unknown, fallback: string): { message: string; fields: FieldErrors } {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  const fields: FieldErrors = {};
  const general: string[] = [];
  const text = (v: unknown) => (Array.isArray(v) ? v.map(String).join(' ') : String(v));
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if ((REVIEW_KEYS as string[]).includes(key)) fields[key as keyof ReviewForm] = text(value);
      else general.push(text(value));
    }
  }
  const hasFields = Object.keys(fields).length > 0;
  return {
    message: general.join(' ') || (hasFields ? 'Please fix the highlighted fields.' : fallback),
    fields,
  };
}

/**
 * Renders whatever the OCR/structuring step produced, without assuming a
 * schema. The backend's structured_data shape differs per category
 * (prescription vs report), and mock runs add underscore-prefixed
 * bookkeeping keys — so this walks the object rather than reading fixed
 * fields that may not exist.
 */
function StructuredData({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) {
    return <Text style={type.caption}>Nothing has been extracted from this document yet.</Text>;
  }

  return (
    <>
      {entries.map(([key, value]) => {
        const label = key.replace(/_/g, ' ');
        if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          return (
            <Row key={key} style={styles.dataRow}>
              <Text style={[type.caption, { flex: 1, textTransform: 'capitalize' }]}>{label}</Text>
              <Text style={type.micro}>Not found</Text>
            </Row>
          );
        }
        if (Array.isArray(value)) {
          return (
            <View key={key} style={styles.dataBlock}>
              <Text style={[type.caption, { textTransform: 'capitalize', marginBottom: spacing.xs }]}>
                {label}
              </Text>
              {value.map((item, i) => (
                <Text key={i} style={type.label}>
                  •{' '}
                  {typeof item === 'object' && item !== null
                    ? Object.values(item as Record<string, unknown>).filter(Boolean).join(' · ')
                    : String(item)}
                </Text>
              ))}
            </View>
          );
        }
        return (
          <Row key={key} style={styles.dataRow}>
            <Text style={[type.caption, { flex: 1, textTransform: 'capitalize' }]}>{label}</Text>
            <Text style={[type.label, { flex: 1, textAlign: 'right' }]}>
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </Text>
          </Row>
        );
      })}
    </>
  );
}

export default function DocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ReviewForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const applyDoc = useCallback((data: Doc) => {
    setDoc(data);
    setForm(seedReview(data));
    setFieldErrors({});
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const { data } = await documentsApi.get(id);
      applyDoc(data);
    } catch {
      setError("Couldn't load this document.");
    } finally {
      setLoading(false);
    }
  }, [id, applyDoc]);

  useEffect(() => {
    void load();
  }, [load]);

  // While the server is still reading the file, poll quietly until the
  // status moves on. A failed poll is ignored; the next tick tries again.
  const status = doc?.status;
  useEffect(() => {
    if (status !== 'processing' || !id) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const { data } = await documentsApi.get(id);
        if (!cancelled && data.status !== 'processing') applyDoc(data);
      } catch {
        // keep polling
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, id, applyDoc]);

  function setField<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  /** Save the edits, then confirm — the same two-step the website uses. */
  async function handleConfirm() {
    if (!doc || !form) return;
    setConfirmError(null);
    setFieldErrors({});
    setConfirming(true);
    try {
      await documentsApi.update(doc.id, {
        title: form.title.trim(),
        category: form.category,
        document_date: form.document_date || null,
        hospital_name: form.hospital_name.trim(),
        doctor_name: form.doctor_name.trim(),
      });
      const { data } = await documentsApi.confirm(doc.id);
      applyDoc(data);
    } catch (err) {
      const parsed = parseServerError(err, "Couldn't save your review. Please try again.");
      setConfirmError(parsed.message);
      setFieldErrors(parsed.fields);
      // The PATCH may have landed before confirm failed; resync the record
      // but keep the form as the person typed it.
      try {
        const { data } = await documentsApi.get(doc.id);
        setDoc(data);
      } catch {
        // keep what we have
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleRetry() {
    if (!doc) return;
    setRetryError(null);
    setRetrying(true);
    try {
      const { data } = await documentsApi.retryProcessing(doc.id);
      applyDoc(data);
    } catch (err) {
      setRetryError(
        parseServerError(err, "Couldn't process it this time either. Please try again shortly.").message
      );
      try {
        const { data } = await documentsApi.get(doc.id);
        applyDoc(data);
      } catch {
        // keep what we have
      }
    } finally {
      setRetrying(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this document?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await documentsApi.delete(id);
            router.back();
          } catch {
            setError("Couldn't delete this document.");
          }
        },
      },
    ]);
  }

  if (loading) return <Loading label="Loading document…" />;
  if (error || !doc) {
    return (
      <Screen>
        <ErrorNote message={error ?? 'Document not found.'} onRetry={load} />
      </Screen>
    );
  }

  const fileUrl = absoluteUrl(doc.file);
  const isImage = !!doc.file && /\.(jpe?g|png)$/i.test(doc.file);

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={type.h2}>{doc.title || 'Untitled document'}</Text>
            <Text style={type.caption}>
              {[doc.document_date, doc.hospital_name, doc.doctor_name].filter(Boolean).join(' · ') ||
                'No details recorded'}
            </Text>
          </View>
          <Badge tone={statusTone[doc.status as keyof typeof statusTone] ?? 'neutral'}>
            {doc.status.replace(/_/g, ' ')}
          </Badge>
        </Row>

        {doc.status === 'processing' && (
          <Text style={[type.caption, { marginTop: spacing.md, color: colors.info }]}>
            We're still reading this document. This page will update on its own when it's done.
          </Text>
        )}
      </Card>

      {doc.status === 'needs_review' && !!form && (
        <Card>
          <CardHeader
            title="Review what we read"
            subtitle="These details were filled in automatically. Correct anything that looks wrong, then confirm."
          />
          <Input
            label="Title"
            value={form.title}
            onChangeText={(v) => setField('title', v)}
            error={fieldErrors.title}
          />
          {(() => {
            const suggested = (doc.structured_data as Record<string, unknown> | undefined)?.title;
            return typeof suggested === 'string' && suggested && suggested !== form.title ? (
              <Pressable
                onPress={() => setField('title', suggested)}
                style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}
              >
                <Text style={[type.micro, { color: colors.brandPurple }]}>
                  Use suggested title: “{suggested}”
                </Text>
              </Pressable>
            ) : null;
          })()}

          <Text style={[type.caption, { marginBottom: spacing.xs }]}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => setField('category', c.value)}
                style={[styles.chip, form.category === c.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, form.category === c.value && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {!!fieldErrors.category && <Text style={styles.fieldError}>{fieldErrors.category}</Text>}

          <DateField
            label="Document date"
            value={form.document_date}
            onChange={(v) => setField('document_date', v)}
            maximumDate={new Date()}
          />
          {!!fieldErrors.document_date && (
            <Text style={[styles.fieldError, { marginTop: -spacing.sm }]}>{fieldErrors.document_date}</Text>
          )}

          <Input
            label="Hospital / source"
            value={form.hospital_name}
            onChangeText={(v) => setField('hospital_name', v)}
            error={fieldErrors.hospital_name}
          />
          <Input
            label="Doctor"
            value={form.doctor_name}
            onChangeText={(v) => setField('doctor_name', v)}
            error={fieldErrors.doctor_name}
          />

          {!!confirmError && <Text style={styles.fieldError}>{confirmError}</Text>}
          <Button onPress={handleConfirm} loading={confirming}>
            Confirm these details are correct
          </Button>
        </Card>
      )}

      {doc.status === 'failed' && (
        <Card>
          <Text style={type.caption}>
            {String(
              (doc.structured_data as Record<string, unknown> | undefined)?.note ??
                'The file uploaded fine, but automatic reading of it failed.'
            )}
          </Text>
          {!!retryError && (
            <Text style={[styles.fieldError, { marginTop: spacing.sm, marginBottom: 0 }]}>{retryError}</Text>
          )}
          <Button variant="secondary" onPress={handleRetry} loading={retrying} style={{ marginTop: spacing.md }}>
            Retry processing
          </Button>
        </Card>
      )}

      {!!fileUrl && (
        <Card>
          <CardHeader title="Original file" />
          {isImage ? (
            <Image source={{ uri: fileUrl }} style={styles.preview} resizeMode="contain" />
          ) : (
            <Text style={type.caption}>This document is a PDF.</Text>
          )}
          <Button variant="secondary" onPress={() => Linking.openURL(fileUrl)} style={{ marginTop: spacing.md }}>
            Open original
          </Button>
        </Card>
      )}

      <Card>
        <CardHeader title="Extracted details" />
        <StructuredData data={doc.structured_data ?? {}} />
      </Card>

      <Pressable onPress={confirmDelete} style={styles.deleteRow}>
        <Feather name="trash-2" size={15} color={colors.danger} />
        <Text style={styles.deleteText}>Delete this document</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 280,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  dataRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dataBlock: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  deleteText: { fontSize: 14, fontWeight: '600', color: colors.danger },
  fieldError: { ...type.micro, color: colors.danger, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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
});
