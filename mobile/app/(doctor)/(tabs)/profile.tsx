import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { doctorApi } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function timeToDate(value: string | null, fallbackHour: number) {
  const d = new Date();
  if (value) {
    const [h, m] = value.split(':').map(Number);
    d.setHours(h ?? fallbackHour, m ?? 0, 0, 0);
  } else {
    d.setHours(fallbackHour, 0, 0, 0);
  }
  return d;
}

function dateToTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function DoctorProfile() {
  const { doctor, account, refreshDoctor, logout } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(doctor?.full_name ?? '');
  const [specialization, setSpecialization] = useState(doctor?.specialization ?? '');
  const [qualification, setQualification] = useState(doctor?.qualification ?? '');
  const [clinicName, setClinicName] = useState(doctor?.clinic_name ?? '');
  const [clinicAddress, setClinicAddress] = useState(doctor?.clinic_address ?? '');
  const [bookingPhone, setBookingPhone] = useState(doctor?.booking_phone_number ?? '');
  const [fee, setFee] = useState(doctor?.consultation_fee ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [days, setDays] = useState<string[]>(doctor?.available_days ?? []);
  const [openTime, setOpenTime] = useState(timeToDate(doctor?.clinic_open_time ?? null, 9));
  const [closeTime, setCloseTime] = useState(timeToDate(doctor?.clinic_close_time ?? null, 17));
  const [picking, setPicking] = useState<'open' | 'close' | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setFullName(doctor?.full_name ?? '');
    setSpecialization(doctor?.specialization ?? '');
    setQualification(doctor?.qualification ?? '');
    setClinicName(doctor?.clinic_name ?? '');
    setClinicAddress(doctor?.clinic_address ?? '');
    setBookingPhone(doctor?.booking_phone_number ?? '');
    setFee(doctor?.consultation_fee ?? '');
    setEditing(true);
  }

  async function handleSaveProfile() {
    setError(null);
    setSavingProfile(true);
    try {
      const form = new FormData();
      form.append('full_name', fullName.replace(/^dr(\.\s*|\s+)/i, '').trim());
      form.append('specialization', specialization.trim());
      form.append('qualification', qualification.trim());
      form.append('clinic_name', clinicName.trim());
      form.append('clinic_address', clinicAddress.trim());
      form.append('booking_phone_number', bookingPhone.trim());
      if (fee) form.append('consultation_fee', String(fee));

      await doctorApi.updateProfile(form);
      await refreshDoctor();
      setEditing(false);
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      const firstField = data && Object.entries(data)[0];
      setError(
        firstField
          ? `${firstField[0].replace(/_/g, ' ')}: ${
              Array.isArray(firstField[1]) ? firstField[1].join(' ') : String(firstField[1])
            }`
          : "Couldn't save your profile. Check your connection and try again."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveHours() {
    setError(null);
    if (openTime >= closeTime) {
      setError('Closing time must be after opening time.');
      return;
    }
    setSavingHours(true);
    try {
      await doctorApi.updateAvailability({
        available_days: days,
        clinic_open_time: dateToTime(openTime),
        clinic_close_time: dateToTime(closeTime),
      });
      await refreshDoctor();
      setHoursSaved(true);
      setTimeout(() => setHoursSaved(false), 1800);
    } catch {
      setError("Couldn't save your clinic hours.");
    } finally {
      setSavingHours(false);
    }
  }

  const verificationTone =
    doctor?.verification_status === 'verified'
      ? 'success'
      : doctor?.verification_status === 'rejected'
        ? 'danger'
        : 'warning';

  return (
    <Screen>
      {!!error && <ErrorNote message={error} />}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>Dr. {doctor?.full_name}</Text>
          <Badge tone={verificationTone}>{doctor?.verification_status}</Badge>
        </Row>

        {editing ? (
          <View style={{ marginTop: spacing.md }}>
            <Input label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <Input label="Specialization" value={specialization} onChangeText={setSpecialization} />
            <Input label="Qualification" value={qualification} onChangeText={setQualification} />
            <Input label="Clinic name" value={clinicName} onChangeText={setClinicName} />
            <Input label="Clinic address" value={clinicAddress} onChangeText={setClinicAddress} multiline />
            <Input
              label="Booking phone number"
              value={bookingPhone}
              onChangeText={setBookingPhone}
              keyboardType="phone-pad"
            />
            <Input
              label="Consultation fee"
              value={String(fee ?? '')}
              onChangeText={setFee}
              keyboardType="numeric"
            />

            <Row style={{ gap: spacing.sm }}>
              <Button style={{ flex: 1 }} onPress={handleSaveProfile} loading={savingProfile}>
                Save
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => setEditing(false)}>
                Cancel
              </Button>
            </Row>
          </View>
        ) : (
          <>
            {[
              ['Specialization', doctor?.specialization],
              ['Qualification', doctor?.qualification || '—'],
              ['Registration number', doctor?.registration_number || '—'],
              ['Clinic', doctor?.clinic_name || '—'],
              ['Address', doctor?.clinic_address || '—'],
              ['Booking number', doctor?.booking_phone_number || '—'],
              ['Consultation fee', doctor?.consultation_fee ? `₹${doctor.consultation_fee}` : '—'],
            ].map(([label, value]) => (
              <Row key={label} style={styles.factRow}>
                <Text style={[type.caption, { flex: 1 }]}>{label}</Text>
                <Text style={[type.label, { flex: 1, textAlign: 'right' }]}>{value}</Text>
              </Row>
            ))}
            <Button variant="secondary" onPress={startEditing} style={{ marginTop: spacing.md }}>
              Edit profile
            </Button>
            <Text style={styles.warnNote}>
              Changing your registration number sends you back to the admin queue for
              re-verification — the number is what an admin actually checked.
            </Text>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Clinic availability" subtitle="Shown to patients in Find Care" />

        <View style={styles.dayGrid}>
          {DAY_NAMES.map((d) => {
            const on = days.includes(d);
            return (
              <Pressable
                key={d}
                onPress={() => setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                style={[styles.dayChip, on && styles.dayChipOn]}
              >
                <Text style={[styles.dayText, on && styles.dayTextOn]}>{d.slice(0, 3)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Row style={{ gap: spacing.md, marginTop: spacing.md }}>
          <Pressable style={[styles.timeButton, { flex: 1 }]} onPress={() => setPicking('open')}>
            <Text style={type.micro}>Opens</Text>
            <Text style={type.label}>{dateToTime(openTime)}</Text>
          </Pressable>
          <Pressable style={[styles.timeButton, { flex: 1 }]} onPress={() => setPicking('close')}>
            <Text style={type.micro}>Closes</Text>
            <Text style={type.label}>{dateToTime(closeTime)}</Text>
          </Pressable>
        </Row>

        {picking && (
          <DateTimePicker
            value={picking === 'open' ? openTime : closeTime}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_e, selected) => {
              if (Platform.OS !== 'ios') setPicking(null);
              if (!selected) return;
              if (picking === 'open') setOpenTime(selected);
              else setCloseTime(selected);
            }}
          />
        )}

        <Button onPress={handleSaveHours} loading={savingHours} style={{ marginTop: spacing.md }}>
          Save availability
        </Button>
        {hoursSaved && (
          <Row style={{ marginTop: spacing.sm }}>
            <Feather name="check" size={13} color={colors.success} />
            <Text style={[type.micro, { color: colors.success }]}>Availability saved</Text>
          </Row>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={type.caption}>Login number (private)</Text>
            <Text style={type.label}>{account?.phone_number}</Text>
          </View>
          <Pressable
            onPress={async () => {
              await logout();
              router.replace('/login');
            }}
            style={styles.signOut}
          >
            <Feather name="log-out" size={14} color={colors.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  factRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  warnNote: { ...type.micro, marginTop: spacing.sm },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dayChipOn: { backgroundColor: colors.brandTeal, borderColor: colors.brandTeal },
  dayText: { fontSize: 13, fontWeight: '600', color: colors.ink700 },
  dayTextOn: { color: colors.white },
  timeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
  },
  signOutText: { fontSize: 13, fontWeight: '600', color: colors.danger },
});
