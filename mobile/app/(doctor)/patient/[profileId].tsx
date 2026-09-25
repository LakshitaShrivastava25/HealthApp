import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, CardHeader, ErrorNote, Input, Row, Screen, SectionTitle } from '../../../src/components/ui';
import { notesApi, patientDataApi, profilesApi, unwrap } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

type TimelineEvent = { id: string; event_date: string; title: string; summary: string; event_type: string };
type Doc = { id: string; title: string; category: string; document_date: string | null };
type Allergy = { id: string; substance: string; reaction: string; kind: string };
type Med = { id: string; name: string; dosage: string; frequency: string; instructions: string };

export default function PatientRecordView() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [name, setName] = useState('');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [medications, setMedications] = useState<Med[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [prescription, setPrescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!profileId) return;
    setError(null);
    try {
      const [profile, events, docs, allergyRes, meds] = await Promise.all([
        profilesApi.get(profileId),
        patientDataApi.timeline(profileId),
        patientDataApi.documents(profileId),
        patientDataApi.allergies(profileId),
        patientDataApi.medications(profileId),
      ]);
      setName(profile.data.full_name);
      setTimeline(unwrap<TimelineEvent>(events.data));
      setDocuments(unwrap<Doc>(docs.data));
      setAllergies(unwrap<Allergy>(allergyRes.data));
      setMedications(unwrap<Med>(meds.data));
    } catch {
      setError(
        "Couldn't load this record. Your access may have been revoked by the patient."
      );
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSaveNote() {
    if (!profileId) return;
    setSaving(true);
    setError(null);
    try {
      await notesApi.create({
        profile: profileId,
        diagnosis: diagnosis.trim(),
        prescription: prescription.trim(),
        notes: notes.trim(),
      });
      setDiagnosis('');
      setPrescription('');
      setNotes('');
      setShowNoteForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save the note. You may no longer have approved access to this patient.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandTeal} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      <Card>
        <Text style={type.h2}>{name || 'Patient record'}</Text>
        <Row style={{ marginTop: spacing.sm }}>
          <Feather name="eye" size={14} color={colors.ink500} />
          <Text style={[type.caption, { flex: 1 }]}>
            Read-only, shown with this patient's approval. They can revoke it at any time.
          </Text>
        </Row>
      </Card>

      {/* Allergies lead: the one thing that changes a prescribing decision. */}
      <SectionTitle>Allergies</SectionTitle>
      <Card>
        {allergies.length === 0 ? (
          <Text style={type.caption}>No allergies recorded for this patient.</Text>
        ) : (
          allergies.map((a) => (
            <Row key={a.id} style={styles.listRow}>
              <Feather name="alert-triangle" size={15} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{a.substance}</Text>
                <Text style={type.micro}>
                  {[a.kind, a.reaction].filter(Boolean).join(' · ') || 'No reaction recorded'}
                </Text>
              </View>
            </Row>
          ))
        )}
      </Card>

      <SectionTitle>Current medicines</SectionTitle>
      <Card>
        {medications.length === 0 ? (
          <Text style={type.caption}>Nothing currently recorded.</Text>
        ) : (
          medications.map((m) => (
            <Row key={m.id} style={styles.listRow}>
              <Feather name="circle" size={15} color={colors.brandPurple} />
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{m.name}</Text>
                <Text style={type.micro}>
                  {[m.dosage, m.frequency, m.instructions].filter(Boolean).join(' · ') ||
                    'No dosage recorded'}
                </Text>
              </View>
            </Row>
          ))
        )}
      </Card>

      <SectionTitle>History</SectionTitle>
      <Card>
        {timeline.length === 0 ? (
          <Text style={type.caption}>No timeline events for this patient.</Text>
        ) : (
          timeline.map((e) => (
            <Row key={e.id} style={styles.listRow}>
              <Text style={[type.micro, { width: 62 }]}>{e.event_date}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{e.title}</Text>
                {!!e.summary && <Text style={type.micro}>{e.summary}</Text>}
              </View>
              <Badge tone="neutral">{e.event_type}</Badge>
            </Row>
          ))
        )}
      </Card>

      <SectionTitle>Documents</SectionTitle>
      <Card>
        {documents.length === 0 ? (
          <Text style={type.caption}>No documents uploaded by this patient.</Text>
        ) : (
          documents.map((d) => (
            <Row key={d.id} style={styles.listRow}>
              <View style={styles.fileIcon}>
                <Feather name="file-text" size={15} color={colors.brandPurple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.label} numberOfLines={1}>
                  {d.title || 'Untitled document'}
                </Text>
                <Text style={type.micro}>{d.document_date || 'No date recorded'}</Text>
              </View>
              <Badge tone="neutral">{d.category}</Badge>
            </Row>
          ))
        )}
      </Card>

      <SectionTitle>Consultation note</SectionTitle>
      {showNoteForm ? (
        <Card>
          <CardHeader
            title="New note"
            subtitle="Clearly recorded as doctor-authored, separate from the patient's own uploads"
          />
          <Input label="Diagnosis" value={diagnosis} onChangeText={setDiagnosis} placeholder="e.g. Hypertension" />
          <Input
            label="Prescription"
            value={prescription}
            onChangeText={setPrescription}
            placeholder="Medicines and dosage"
            multiline
          />
          <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Observations, advice" multiline />
          <Row style={{ gap: spacing.sm }}>
            <Button style={{ flex: 1 }} onPress={handleSaveNote} loading={saving}>
              Save note
            </Button>
            <Button variant="secondary" style={{ flex: 1 }} onPress={() => setShowNoteForm(false)}>
              Cancel
            </Button>
          </Row>
        </Card>
      ) : (
        <Button onPress={() => setShowNoteForm(true)}>Add a consultation note</Button>
      )}

      {saved && (
        <Row style={{ justifyContent: 'center' }}>
          <Feather name="check-circle" size={14} color={colors.success} />
          <Text style={[type.caption, { color: colors.success }]}>Consultation note saved</Text>
        </Row>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listRow: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fileIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
