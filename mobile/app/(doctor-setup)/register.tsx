import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import CouncilPicker from '../../src/components/CouncilPicker';
import RegisterCheck, { type RegisterFill } from '../../src/components/RegisterCheck';
import { Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { doctorApi, type RegisterPrefill, type UploadFile } from '../../src/lib/api';
import { pickDocument, pickFromCamera } from '../../src/lib/pickFile';
import { colors, radius, spacing, type } from '../../src/theme';
import { useConfirmExit } from '../../src/lib/useBackHandler';
import { resetTo } from '../../src/lib/navigation';

/** Strips a leading "Dr." — every screen prepends it, so a stored one reads
 *  as "Dr. Dr. Priya". Same rule the backend enforces in DoctorSerializer,
 *  applied here so the person sees it corrected before they submit. */
function stripHonorific(name: string) {
  return name.replace(/^dr(\.\s*|\s+)/i, '').trim();
}

type FieldErrors = Record<string, string[]>;

/**
 * "Register as a doctor", opened from More in User mode — the same account
 * then switches between User and Doctor mode. Opened again from the pending
 * screen it edits the registration instead, which is how a doctor corrects
 * the details behind a rejection.
 */
export default function DoctorRegister() {
  useConfirmExit();
  const { doctor, refreshDoctor, account } = useAuth();
  const router = useRouter();
  // Decided once, on open: the record appears mid-submit when registering,
  // and the form must not flip to "edit" under the person's thumb.
  const [editing] = useState(() => !!doctor);

  const [fullName, setFullName] = useState(doctor?.full_name ?? '');
  const [specialization, setSpecialization] = useState(doctor?.specialization ?? '');
  const [qualification, setQualification] = useState(doctor?.qualification ?? '');
  const [experience, setExperience] = useState(doctor ? String(doctor.experience_years ?? '') : '');
  const [clinicName, setClinicName] = useState(doctor?.clinic_name ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(doctor?.registration_number ?? '');
  const [councilId, setCouncilId] = useState(doctor?.state_council_id ?? '');
  const [registrationYear, setRegistrationYear] = useState(
    doctor?.registration_year ? String(doctor.registration_year) : ''
  );
  const [clinicAddress, setClinicAddress] = useState(doctor?.clinic_address ?? '');
  const [bookingPhone, setBookingPhone] = useState(doctor?.booking_phone_number ?? '');
  const [fee, setFee] = useState(doctor?.consultation_fee ?? '');
  const [license, setLicense] = useState<UploadFile | null>(null);
  const [consent, setConsent] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /** A register match fills in what the register holds; every field stays
   *  editable, and Undo puts back what was there before. */
  function fillFromRegister(fill: RegisterPrefill): RegisterFill {
    const before = { fullName, qualification, experience, registrationYear };
    const filled: string[] = [];
    if (fill.full_name && fill.full_name !== fullName) {
      setFullName(fill.full_name);
      filled.push('name');
    }
    if (fill.qualification && fill.qualification !== qualification) {
      setQualification(fill.qualification);
      filled.push('qualification');
    }
    if (fill.registration_year && String(fill.registration_year) !== registrationYear) {
      setRegistrationYear(String(fill.registration_year));
      filled.push('year of registration');
    }
    // Years since registration is only an estimate: it fills a blank, never
    // replaces a number the doctor typed.
    if (fill.experience_years != null && !experience.trim()) {
      setExperience(String(fill.experience_years));
      filled.push('years of experience');
    }
    return {
      filled,
      undo: () => {
        setFullName(before.fullName);
        setQualification(before.qualification);
        setExperience(before.experience);
        setRegistrationYear(before.registrationYear);
      },
    };
  }

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
      form.append('state_council_id', councilId);
      if (registrationYear) form.append('registration_year', registrationYear);
      // Asked once, at registration; the backend requires it from any form that sends it.
      if (!editing) form.append('verification_consent', String(consent));
      form.append('clinic_address', clinicAddress.trim());
      form.append('booking_phone_number', bookingPhone.trim());
      // Optional fields are omitted rather than sent blank: an empty string
      // fails DecimalField and FileField parsing server-side.
      if (fee.trim()) form.append('consultation_fee', fee.trim());
      if (license) form.append('license_document', license as unknown as Blob);

      if (editing) {
        await doctorApi.updateProfile(form);
        await refreshDoctor();
        router.back();
        return;
      }

      await doctorApi.register(form);
      await refreshDoctor();
      // Straight into Doctor mode: the index route opens the pending screen
      // until an admin verifies the registration.
      // Into Doctor mode through the switch screen: the patient screens this
      // form was pushed from are left first, then the mode flips.
      resetTo({ pathname: '/switch-mode', params: { to: 'doctor' } } as unknown as Href);
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
        setError(
          editing
            ? "Couldn't save your changes. Check your connection and try again."
            : "Couldn't submit your registration. Check your connection and try again."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  // The council is what makes the number checkable on the NMC register; a
  // new registration also needs the year (it tells apart entries sharing a
  // number) and the verification consent.
  const required = [fullName, specialization, clinicName, registrationNumber, councilId, clinicAddress, bookingPhone];
  if (!editing) required.push(registrationYear);
  const canSubmit = required.every((v) => v.trim().length > 0) && (editing || consent);

  const fieldError = (name: string) =>
    fieldErrors[name]?.length ? (
      <Text style={styles.fieldError}>{fieldErrors[name].join(' ')}</Text>
    ) : null;

  return (
    <Screen>
      <Card>
        <CardHeader
          title={editing ? 'Update your registration' : 'Register as a doctor'}
          subtitle={
            editing
              ? 'Changing your registration number, council, name or licence sends your registration back to an admin for review.'
              : `Signed in as ${account?.phone_number ?? ''}. An admin verifies your credentials before you can request patient access. Your own records stay on this same account.`
          }
        />

        {/* Registration first: a register match fills in the name and
            qualifications below it. */}
        <Input
          label="Medical registration number"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholder="Council registration number"
          autoCapitalize="characters"
        />
        {fieldError('registration_number')}

        <CouncilPicker
          value={councilId}
          onChange={setCouncilId}
          error={fieldErrors.state_council_id?.join(' ')}
        />

        <Input
          label={editing ? 'Year of registration (optional)' : 'Year of registration'}
          value={registrationYear}
          onChangeText={(v) => setRegistrationYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="e.g. 2015"
          keyboardType="number-pad"
          error={fieldErrors.registration_year?.join(' ')}
        />

        <RegisterCheck
          registrationNumber={registrationNumber}
          councilId={councilId}
          year={registrationYear}
          fullName={fullName}
          onFill={fillFromRegister}
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
        <CardHeader
          title="Licence document"
          subtitle={editing ? 'Attach a new file only to replace the one on record' : 'Helps an admin verify you faster'}
        />
        {license ? (
          <Row>
            <View style={styles.fileIcon}>
              <Feather name="file-text" size={16} color={colors.brandPurple} />
            </View>
            <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
              {license.name}
            </Text>
            <Pressable onPress={() => setLicense(null)} hitSlop={12}>
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

      {!editing && (
        <Pressable
          onPress={() => setConsent((c) => !c)}
          style={styles.consent}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
        >
          <View style={[styles.checkbox, consent && styles.checkboxOn]}>
            {consent && <Feather name="check" size={13} color="#fff" />}
          </View>
          <Text style={[type.caption, { flex: 1, color: colors.ink700 }]}>
            I consent to CuraPath verifying my registration with the National Medical Commission register via
            authorised verification partners.
          </Text>
        </Pressable>
      )}
      {fieldError('verification_consent')}

      {!!error && <ErrorNote message={error} />}

      <Button onPress={handleSubmit} disabled={!canSubmit} loading={saving}>
        {editing ? 'Save changes' : 'Submit registration'}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.micro, marginTop: -spacing.sm, marginBottom: spacing.md },
  fieldError: { ...type.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  checkbox: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.ink300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
