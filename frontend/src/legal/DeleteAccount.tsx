import { Link } from 'react-router-dom';
import LegalLayout, { EmailLink, List, Section } from './LegalLayout';

/** The account-deletion URL given to Google Play (Data safety → Data deletion). */
export default function DeleteAccount() {
  return (
    <LegalLayout title="Delete your CuraPath account">
      <p className="mt-6 text-[15px] leading-relaxed text-ink-700">
        This page explains how to delete your CuraPath account and the data in it, whether or not you
        still have the app installed.
      </p>

      <Section title="Delete in the app or on the web">
        <List
          items={[
            <>In the CuraPath Android app: open <strong>Settings</strong>, scroll to <strong>Account</strong>, tap <strong>Delete account</strong>, and confirm.</>,
            <>On the web: sign in at{' '}
              <Link to="/patient/login" className="font-medium text-brand-purple underline underline-offset-2">web.curapath.in</Link>,
              open <strong>Settings</strong>, choose <strong>Delete Account</strong>, and confirm.</>,
          ]}
        />
        <p>
          Your account is closed immediately: you are signed out everywhere, and the account can no
          longer be used. Your emergency card link and any doctor access stop working along with it.
        </p>
      </Section>

      <Section title="Erase all of your data">
        <p>
          To have your records permanently erased as well, or if you can no longer sign in, email{' '}
          <EmailLink subject="Erase my CuraPath data" /> with the subject “Erase my CuraPath data” and
          your registered mobile number. We may contact you on that number to confirm the request.
        </p>
        <p>Within 30 days, we permanently delete:</p>
        <List
          items={[
            'your account and mobile number;',
            'every family profile under the account, with allergies, timeline and emergency card;',
            'uploaded documents and insurance policies, including the stored files;',
            'medicines, reminder schedules and dose history;',
            'doctor access grants and doctor notes on your profiles, and your push-notification tokens.',
          ]}
        />
        <p>
          We may keep minimal records where the law requires it, such as security logs, for up to
          180 days. Copies in backups are overwritten as the backups expire.
        </p>
      </Section>
    </LegalLayout>
  );
}
