import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { doctorApi, type UploadFile } from '../../src/lib/api';
import { pickDocument, pickFromCamera } from '../../src/lib/pickFile';
import { colors, radius, spacing, type } from '../../src/theme';
import { useConfirmExit } from '../../src/lib/useBackHandler';

/** Strips a leading "Dr." — every screen prepends it, so a stored one reads
 *  as "Dr. Dr. Priya". Same rule the backend enforces in DoctorSerializer,
 *  applied here so the person sees it corrected before they submit. */
function stripHonorific(name: string) {
  return name.replace(/^dr(\.\s*|\s+)/i, '').trim();
}

type FieldErrors = Record<string, string[]>;

export default function DoctorRegister() {
  useConfirmExit();
  const { doctor, hasRegistered, refreshDoctor, account } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [qualification, setQualification] = useState('');
  const [experience, setExperience] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');
  const [fee, setFee] = useState('');
  const [license, setLicense] = useState<UploadFile | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // An account that already has a Doctor record has nothing to do here.
  useEffect(() => {
    if (hasRegistered) router.replace('/(doctor-setup)/pending');
  }, [hasRegistered, router]);

  async function attachLicense(pick: () => Promise<UploadFile | null>) {
    try {
      const file = await pick();
      if (file) setLicense(file);
    } catch {
      setError("Couldn't open that picker.");
    }
  }

  async function handleSubmit() {
    setError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const form = new FormData();
      form.append('full_name', stripHonorific(fullName));
      form.append('specialization', specialization.trim());
      form.append('qualification', qualification.trim());
      form.append('experience_years', String(Number(experience) || 0));
      form.append('clinic_name', clinicName.trim());
      form.append('registration_number', registrationNumber.trim());
      form.append('clinic_address', clinicAddress.trim());
      form.append('booking_phone_number', bookingPhone.trim());
      // Optional fields are omitted rather than sent blank: an empty string
      // fails DecimalField and FileField parsing server-side.
      if (fee.trim()) form.append('consultation_fee', fee.trim());
      if (license) form.append('license_document', license as unknown as Blob);

      await doctorApi.register(form);
      await refreshDoctor();
      router.replace('/(doctor-setup)/pending');
    } catch (err) {
      const response = (err as { response?: { data?: Record<string, string[] | string> } })?.response;
      const data = response?.data;
      if (data && typeof data === 'object') {
        const detail = data.detail;
        if (typeof detail === 'string') {
          setError(detail);
        } else {
          // DRF returns per-field arrays — showing them under their own
          // inputs is far more useful than one generic failure line.
          setFieldErrors(data as FieldErrors);
          setError('Please correct the highlighted fields.');
        }
      } else {
        setError("Couldn't submit your registration. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const required = [fullName, specialization, clinicName, registrationNumber, clinicAddress, bookingPhone];
  const canSubmit = required.every((v) => v.trim().length > 0);

  const fieldError = (name: string) =>
    fieldErrors[name]?.length ? (
      <Text style={styles.fieldError}>{fieldErrors[name].join(' ')}</Text>
    ) : null;

  return (
    <Screen>
      <Card>
        <CardHeader
          title="Register as a doctor"
          subtitle={`Signed in as ${account?.phone_number ?? ''}. An admin verifies your credentials before you can request patient access.`}
        />

        <Input
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Priya Nair"
          autoCapitalize="words"
        />
        <Text style={styles.hint}>Do not include "Dr." — it is added automatically everywhere.</Text>
        {fieldError('full_name')}

        <Input
          label="Specialization"
          value={specialization}
          onChangeText={setSpecialization}
          placeholder="e.g. Cardiology"
        />
        {fieldError('specialization')}

        <Input
          label="Qualification"
          value={qualification}
          onChangeText={setQualification}
          placeholder="e.g. MBBS, MD"
        />

        <Input
          label="Years of experience"
          value={experience}
          onChangeText={setExperience}
          placeholder="e.g. 12"
          keyboardType="numeric"
        />

        <Input
          label="Medical registration number"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholder="Council registration number"
          autoCapitalize="characters"
        />
        {fieldError('registration_number')}

        <Input label="Clinic name" value={clinicName} onChangeText={setClinicName} placeholder="e.g. City Heart Clinic" />
        {fieldError('clinic_name')}

        <Input
          label="Clinic address"
          value={clinicAddress}
          onChangeText={setClinicAddress}
          placeholder="Street, area, city"
          multiline
        />
        {fieldError('clinic_address')}

        <Input
          label="Booking phone number"
          value={bookingPhone}
          onChangeText={setBookingPhone}
          placeholder="Clinic number shown to patients"
          keyboardType="phone-pad"
        />
        <Text style={styles.hint}>
          This is shown to patients. It is deliberately separate from your private login number.
        </Text>
        {fieldError('booking_phone_number')}

        <Input
          label="Consultation fee (optional)"
          value={fee}
          onChangeText={setFee}
          placeholder="e.g. 800"
          keyboardType="numeric"
        />
      </Card>

      <Card>
        <CardHeader title="Licence document" subtitle="Helps an admin verify you faster" />
        {license ? (
          <Row>
            <View style={styles.fileIcon}>
              <Feather name="file-text" size={16} color={colors.brandPurple} />
            </View>
            <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
              {license.name}
            </Text>
            <Pressable onPress={() => setLicense(null)}>
              <Feather name="x" size={16} color={colors.ink500} />
            </Pressable>
          </Row>
        ) : (
          <Row style={{ gap: spacing.sm }}>
            <Button variant="secondary" style={{ flex: 1 }} onPress={() => attachLicense(pickFromCamera)}>
              Photograph
            </Button>
            <Button variant="secondary" style={{ flex: 1 }} onPress={() => attachLicense(pickDocument)}>
              Choose file
            </Button>
          </Row>
        )}
      </Card>

      {!!error && <ErrorNote message={error} />}

      <Button onPress={handleSubmit} disabled={!canSubmit} loading={saving}>
        Submit registration
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.micro, marginTop: -spacing.sm, marginBottom: spacing.md },
  fieldError: { ...type.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
