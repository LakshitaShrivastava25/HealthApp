import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, CardHeader, ErrorNote, Loading, Row, Screen } from '../../../src/components/ui';
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

const statusTone = { processed: 'success', needs_review: 'warning', failed: 'danger' } as const;

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

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const { data } = await documentsApi.get(id);
      setDoc(data);
    } catch {
      setError("Couldn't load this document.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
            {doc.status.replace('_', ' ')}
          </Badge>
        </Row>

        {doc.status === 'needs_review' && (
          <Text style={[type.caption, { marginTop: spacing.md, color: colors.warning }]}>
            The details below were read automatically and have not been verified. Check them against
            the original before relying on them.
          </Text>
        )}
      </Card>

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
});
