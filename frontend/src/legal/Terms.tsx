import { Link } from 'react-router-dom';
import LegalLayout, { COMPANY, EmailLink, List, Section } from './LegalLayout';

export default function Terms() {
  return (
    <LegalLayout title="Terms of Use">
      <Section title="Agreement">
        <p>
          CuraPath is provided by {COMPANY}, Jabalpur, Madhya Pradesh, India (“we”, “us”). These terms
          apply to your use of CuraPath on Android and at curapath.in. By creating an
          account or using the service, you agree to them and to our{' '}
          <Link to="/privacy" className="font-medium text-brand-purple underline underline-offset-2">Privacy Policy</Link>.
          If you don’t agree, please don’t use CuraPath.
        </p>
      </Section>

      <Section title="CuraPath is not medical advice">
        <p>
          CuraPath helps you store and organise health information. It does not diagnose, treat or give
          medical advice, and it is not an emergency service. In an emergency, call 112 or go to the
          nearest hospital.
        </p>
        <p>
          Details read automatically from your documents, insurance summaries, estimates and answers in
          the app can be incomplete or wrong. Always check them against the original documents and ask
          your doctor or insurer before making decisions. Medicine reminders are a convenience; you remain
          responsible for taking medicines as prescribed.
        </p>
      </Section>

      <Section title="Your account">
        <List
          items={[
            'You must be 18 or older, and must sign in with a mobile number that belongs to you.',
            'Keep your phone and login codes private. You are responsible for activity on your account.',
            'You may add family members only if you have the authority to manage their health information.',
            'Doctors must give accurate registration details and may view a patient’s records only while that patient grants access.',
          ]}
        />
      </Section>

      <Section title="Your content">
        <p>
          You own the records and information you add. You give us permission to store, process and
          display them only as needed to run CuraPath for you, as described in the Privacy Policy. You
          confirm that you have the right to upload what you add.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>Don’t misuse CuraPath. In particular, don’t:</p>
        <List
          items={[
            'access accounts or records that aren’t yours, or that you haven’t been given access to;',
            'upload unlawful content or someone else’s records without their permission;',
            'try to break, overload, scrape or reverse-engineer the service.',
          ]}
        />
        <p>We may suspend or close accounts that break these terms.</p>
      </Section>

      <Section title="Ending your use">
        <p>
          You can stop using CuraPath and delete your account at any time. See the{' '}
          <Link to="/delete-account" className="font-medium text-brand-purple underline underline-offset-2">Delete Account</Link> page.
        </p>
      </Section>

      <Section title="Availability and liability">
        <p>
          We work to keep CuraPath available and your data safe, but the service is provided “as is”,
          without guarantees that it will always be available or error-free. Keep your own copies of
          important documents. To the extent the law allows, we are not liable for indirect or
          consequential losses, or for decisions made using information in the app.
        </p>
      </Section>

      <Section title="Changes and governing law">
        <p>
          We may update these terms; the date above shows the latest version. If you keep using
          CuraPath after a change, you accept the updated terms. These terms are governed by the laws of
          India. Contact us at <EmailLink subject="Terms of Use" /> with any questions.
        </p>
      </Section>
    </LegalLayout>
  );
}
