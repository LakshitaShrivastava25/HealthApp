import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, CardHeader, ErrorNote, Input, Loading, Row, Screen } from '../../src/components/ui';
import { adminApi } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

type OtpSettings = {
  mode: 'sms' | 'master';
  master_otp: string;
  // True when USE_MASTER_OTP in the server env overrides the toggle.
  mode_locked_by_env: boolean;
  updated_at: string;
  updated_by: string | null;
  sms_provider: 'twilio' | '2factor';
  sms_configured: boolean;
  // Sender, template and balance only apply to 2Factor.
  sms_sender_id: string;
  sms_template_name: string;
  sms_balance: string | null;
};

type TestResult = { ok: boolean; details: string; delivery_status: string; hint: string };

function errorDetail(err: unknown, fallback: string) {
  const res = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
  if (res?.status === 403) return 'OTP settings are restricted to full administrators.';
  return res?.data?.detail || fallback;
}

/**
 * The login OTP switch — same endpoint as the website's admin OTP Settings
 * page. MASTER: no SMS, every number signs in with the master code.
 * SMS: a random code goes out through Twilio Verify (or 2Factor, the legacy
 * fallback, per sms_provider). Applies to web and app at once.
 */
export default function AdminOtpSettings() {
  const [data, setData] = useState<OtpSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [masterDraft, setMasterDraft] = useState('');
  const [testPhone, setTestPhone] = useState('+91');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: next } = await adminApi.otpSettings();
      setData(next);
      setMasterDraft(next.master_otp);
    } catch (err) {
      setError(errorDetail(err, "Couldn't load OTP settings."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function save(patch: { mode?: 'sms' | 'master'; master_otp?: string }) {
    setSaving(true);
    setError(null);
    try {
      const { data: next } = await adminApi.updateOtpSettings(patch);
      // PATCH skips the slow balance lookup; keep the last known value.
      setData((prev) => ({ ...next, sms_balance: prev?.sms_balance ?? null }));
      setMasterDraft(next.master_otp);
    } catch (err) {
      setError(errorDetail(err, "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: r } = await adminApi.sendTestSms(testPhone.trim());
      setTestResult(r);
    } catch (err) {
      setTestResult({ ok: false, details: errorDetail(err, 'Request failed.'), delivery_status: '', hint: '' });
    } finally {
      setTesting(false);
    }
  }

  if (!data) {
    return (
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {error ? <ErrorNote message={error} onRetry={load} /> : <Loading label="Loading OTP settings…" />}
      </Screen>
    );
  }

  const isMaster = data.mode === 'master';
  const isTwilio = data.sms_provider === 'twilio';
  const providerName = isTwilio ? 'Twilio Verify' : '2Factor';
  const locked = data.mode_locked_by_env;
  const deliveryTone = /deliver/i.test(testResult?.delivery_status ?? '')
    ? 'success'
    : testResult?.delivery_status === 'pending'
      ? 'neutral'
      : 'danger';

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {!!error && <ErrorNote message={error} />}

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <CardHeader
              title="Login OTP mode"
              subtitle={
                data.updated_by
                  ? `Last changed by ${data.updated_by} · ${new Date(data.updated_at).toLocaleString()}`
                  : 'Applies to the website and the app instantly'
              }
            />
          </View>
          <Badge tone={isMaster ? 'warning' : 'success'}>{isMaster ? 'Master OTP' : 'SMS OTP'}</Badge>
        </Row>

        <ModeOption
          icon="message-square"
          title={`SMS OTP (${providerName})`}
          note="A fresh random code is texted to the user's phone."
          selected={!isMaster}
          disabled={saving || locked}
          onPress={() => !isMaster || save({ mode: 'sms' })}
        />
        <ModeOption
          icon="key"
          title="Master OTP"
          note={`No SMS. Every number logs in with ${data.master_otp}.`}
          selected={isMaster}
          warning
          disabled={saving || locked}
          onPress={() => isMaster || save({ mode: 'master' })}
        />
        {locked && (
          <Text style={[type.caption, styles.warning]}>
            USE_MASTER_OTP is set in the server environment, so it decides the mode and this toggle has no effect.
            Remove it from the server env to switch from here.
          </Text>
        )}
        {isMaster && (
          <Text style={[type.caption, styles.warning]}>
            Anyone who knows the master code can sign in to any account. Switch back to SMS once delivery works.
          </Text>
        )}

        <View style={styles.divider} />
        <Input
          label="Master OTP (6 digits)"
          value={masterDraft}
          onChangeText={(t) => setMasterDraft(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />
        <Button
          variant="secondary"
          loading={saving}
          disabled={masterDraft.length !== 6 || masterDraft === data.master_otp}
          onPress={() => save({ master_otp: masterDraft })}
        >
          Save code
        </Button>
      </Card>

      <Card>
        <CardHeader
          title={isTwilio ? 'Twilio Verify health' : 'SMS gateway health'}
          subtitle={isTwilio ? 'Twilio Verify SMS codes' : '2Factor.in transactional SMS (legacy fallback)'}
        />
        <InfoRow label={isTwilio ? 'Credentials' : 'API key'}>
          <Badge tone={data.sms_configured ? 'success' : 'danger'}>
            {data.sms_configured ? 'Configured' : 'Missing'}
          </Badge>
        </InfoRow>
        {!data.sms_configured && (
          <Text style={[type.caption, styles.warning]}>
            {providerName} isn't configured on the server, so SMS OTPs can't be sent. Use master OTP until it's set
            up.
          </Text>
        )}
        {!isTwilio && (
          <>
            <InfoRow label="Sender ID">
              <Text style={type.label}>{data.sms_sender_id}</Text>
            </InfoRow>
            <InfoRow label="Template">
              <Text style={type.label}>{data.sms_template_name}</Text>
            </InfoRow>
            <InfoRow label="SMS balance">
              <Text style={type.label}>{data.sms_balance ?? '—'}</Text>
            </InfoRow>
          </>
        )}

        <View style={styles.divider} />
        <Text style={[type.caption, { marginBottom: spacing.sm }]}>
          {isTwilio
            ? 'Send a test code through Twilio Verify. "pending" means Twilio accepted it and is delivering it — there is no delivery report here, so confirm the code arrives on the phone.'
            : 'Send a test SMS and read the operator\'s delivery status. "Accepted" alone doesn\'t mean it arrived — DLT rejections only show up in the delivery status.'}
        </Text>
        <Input
          label="Test phone number"
          value={testPhone}
          onChangeText={setTestPhone}
          keyboardType="phone-pad"
          placeholder="+91 98765 43210"
        />
        <Button loading={testing} onPress={runTest}>
          {testing ? 'Sending…' : 'Send test SMS'}
        </Button>
        {testResult && (
          <View style={styles.result}>
            <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={type.caption}>{providerName}:</Text>
              <Badge tone={testResult.ok ? 'success' : 'danger'}>{testResult.ok ? 'Accepted' : 'Rejected'}</Badge>
            </Row>
            <Text style={[type.micro, { marginTop: 4 }]}>{testResult.details}</Text>
            {/* Twilio has no delivery-report lookup, so its status is always "pending". */}
            {testResult.ok && isTwilio && (
              <Text style={[type.caption, { marginTop: spacing.sm }]}>
                "pending" = accepted by Twilio and on its way. Check the phone to confirm it arrived.
              </Text>
            )}
            {testResult.ok && !isTwilio && (
              <Row style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <Text style={type.caption}>Delivery:</Text>
                <Badge tone={deliveryTone}>{testResult.delivery_status}</Badge>
              </Row>
            )}
            {!!testResult.hint && (
              <Text style={[type.caption, { color: colors.warning, marginTop: spacing.sm }]}>{testResult.hint}</Text>
            )}
          </View>
        )}
      </Card>
    </Screen>
  );
}

function ModeOption({
  icon,
  title,
  note,
  selected,
  warning,
  disabled,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  note: string;
  selected: boolean;
  warning?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const accent = warning ? colors.warning : colors.brandPurple;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.option,
        selected && { borderColor: accent, backgroundColor: warning ? colors.warningBg : colors.brandLavender },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Feather name={selected ? 'check-circle' : icon} size={18} color={selected ? accent : colors.ink500} />
      <View style={{ flex: 1 }}>
        <Text style={type.title}>{title}</Text>
        <Text style={type.caption}>{note}</Text>
      </View>
    </Pressable>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={type.caption}>{label}</Text>
      {children}
    </Row>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  warning: {
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  result: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
