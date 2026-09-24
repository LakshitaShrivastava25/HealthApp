import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, CardHeader, Row, Screen, SectionTitle } from '../../src/components/ui';
import { getApiBaseUrl } from '../../src/lib/config';
import { colors, radius, spacing, type } from '../../src/theme';

const FAQS = [
  {
    q: 'Who can see my medical records?',
    a: 'Only you, and any doctor you have explicitly approved on the Doctor Access screen. A doctor sees nothing until you approve their request, and you can revoke that access at any moment.',
  },
  {
    q: 'What does the emergency QR reveal?',
    a: 'Only the items you switch on: blood group, allergies, current medicines and your emergency contact. It never exposes your documents, insurance or history. You can revoke the card instantly.',
  },
  {
    q: 'Why does my timeline look empty?',
    a: 'Timeline events are built from documents after they are processed. If nothing has been processed yet, there is nothing to show. Find it under More → Health Timeline.',
  },
  {
    q: 'How do family profiles work?',
    a: 'One login can hold several profiles — yourself, a parent, a child. Every document, medicine and policy belongs to one profile, so records never mix. Switch between them from the header.',
  },
  {
    q: 'Is the AI giving me medical advice?',
    a: 'No. It explains your own records and policy documents in plain language. It is not a diagnosis and never replaces a doctor.',
  },
  {
    q: 'What happens if I delete my account?',
    a: 'Your login is deactivated immediately and you are signed out. This is a deactivation, not an erasure of medical records — contact support if you need it reversed.',
  },
];

export default function HelpSupport() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <Screen>
      <Card>
        <CardHeader
          title="How CurePath works"
          subtitle="Your records, your consent, on your phone"
        />
        {[
          { icon: 'folder', text: 'Upload prescriptions and reports — photograph them or pick a PDF.' },
          { icon: 'shield', text: 'Ask questions about your insurance policy and estimate a claim.' },
          { icon: 'clock', text: 'Track medicines and mark doses as taken.' },
          { icon: 'alert-triangle', text: 'Carry an emergency card that works without anyone logging in.' },
        ].map((item) => (
          <Row key={item.text} style={styles.bullet}>
            <View style={styles.icon}>
              <Feather name={item.icon as 'folder'} size={15} color={colors.brandPurple} />
            </View>
            <Text style={[type.caption, { flex: 1 }]}>{item.text}</Text>
          </Row>
        ))}
      </Card>

      <SectionTitle>Common questions</SectionTitle>
      {FAQS.map((faq, i) => {
        const open = openIndex === i;
        return (
          <Card key={faq.q} onPress={() => setOpenIndex(open ? null : i)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={[type.label, { flex: 1 }]}>{faq.q}</Text>
              <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink300} />
            </Row>
            {open && <Text style={[type.caption, { marginTop: spacing.sm }]}>{faq.a}</Text>}
          </Card>
        );
      })}

      <SectionTitle>Still need help?</SectionTitle>
      <Card>
        <Pressable
          onPress={() => Linking.openURL('mailto:support@healthnow.example')}
          style={styles.actionRow}
        >
          <Feather name="mail" size={16} color={colors.brandPurple} />
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Email support</Text>
            <Text style={type.micro}>support@healthnow.example</Text>
          </View>
          <Feather name="external-link" size={15} color={colors.ink300} />
        </Pressable>
      </Card>

      {/* Genuinely useful when a report says "the app won't load" — it says
          exactly which server this install is talking to. */}
      <Card>
        <CardHeader title="Diagnostics" />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.caption}>Connected to</Text>
          <Text style={[type.micro, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
            {getApiBaseUrl()}
          </Text>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bullet: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
