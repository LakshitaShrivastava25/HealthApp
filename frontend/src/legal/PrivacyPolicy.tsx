import { Link } from 'react-router-dom';
import LegalLayout, { EmailLink, List, Section } from './LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy">
      <Section title="Who we are">
        <p>
          CuraPath (“we”, “us”) is a personal health record app. It lets you keep medical records,
          medicines, insurance policies and an emergency card for yourself and your family, on Android
          and at web.curapath.in. This policy explains what we collect, why, who we share it with, and
          the choices you have. For any privacy question or request, write to <EmailLink subject="Privacy" />.
        </p>
      </Section>

      <Section title="Information we collect">
        <List
          items={[
            <><strong>Mobile number.</strong> Used to sign you in with a one-time code (OTP). We don’t use passwords for patients.</>,
            <><strong>Profile details</strong> for you and any family members you add: name, relation, gender, date of birth, blood group and allergies.</>,
            <><strong>Health records you upload</strong>, such as prescriptions, lab reports, scans and discharge summaries, plus the details read from them (dates, hospitals, diagnoses, medicines) that build your health timeline.</>,
            <><strong>Medicines and reminders</strong>: names, dosages, schedules and the doses you mark as taken.</>,
            <><strong>Insurance policies</strong> you upload, the coverage details read from them, and questions you ask about your policy.</>,
            <><strong>Emergency card</strong>: the fields you choose to show and your emergency contact’s name and phone number.</>,
            <><strong>Doctor access</strong>: which doctors you allow to view a profile, and the notes those doctors add.</>,
            <><strong>Doctors only</strong>: name, specialisation, qualifications, registration number, clinic details and the licence document submitted for verification.</>,
            <><strong>Device information</strong>: a push-notification token so we can send you alerts, and basic technical logs (such as IP address and error reports) that our servers keep for security and troubleshooting.</>,
          ]}
        />
        <p>
          The app asks for camera and photo access only when you choose to photograph or attach a
          document. We do not access your contacts, location or microphone, and we do not run
          advertising or third-party analytics.
        </p>
      </Section>

      <Section title="How we use it">
        <List
          items={[
            'To provide the service: store your records, organise them into a timeline, show your medicines and send reminders.',
            'To read uploaded documents automatically, so you don’t have to type in their contents. This is done by software and can make mistakes, so always check against the original document.',
            'To show the people you choose — a doctor you grant access to, or anyone you give your emergency card link or QR code — the information you chose to share with them.',
            'To keep the service secure, for example by limiting login attempts and investigating misuse.',
            'To answer you when you contact support.',
          ]}
        />
        <p>We never sell your data and never use your health information for advertising.</p>
      </Section>

      <Section title="Who we share it with">
        <p>Your information is shared only in these cases:</p>
        <List
          items={[
            <><strong>People you choose.</strong> Doctors you grant access to can see that profile until you revoke access. Your emergency card is visible to anyone who has its link or QR code, showing only the fields you turned on, until you revoke it.</>,
            <><strong>Service providers</strong> who run parts of CuraPath for us, under contracts that limit their use of your data to providing their service: Render (application hosting), a managed PostgreSQL database provider (data storage), Cloudinary (file storage), Anthropic (AI reading of uploaded documents and answers to insurance questions), Twilio (sending login codes by SMS) and Expo (delivering push notifications).</>,
            <><strong>Legal reasons.</strong> When required by law, court order or a government authority, or to protect someone’s life or safety.</>,
          ]}
        />
        <p>Some of these providers process data on servers outside India.</p>
      </Section>

      <Section title="How we protect it">
        <p>
          Data travels over encrypted HTTPS connections. Uploaded files are stored privately and are
          opened only through signed links that expire within hours. Access to your account requires
          a code sent to your mobile number, and sign-in sessions can be ended by signing out. No
          system is perfectly secure, but we work to protect your information and will notify you as
          required by law if a breach affects you.
        </p>
      </Section>

      <Section title="How long we keep it, and deleting your account">
        <p>
          We keep your information while your account is open. You can delete your account at any
          time from the app or web (Settings → Delete account). That signs you out and blocks the
          account immediately.
        </p>
        <p>
          To have your records permanently erased as well, email <EmailLink subject="Erase my CuraPath data" /> from
          or about your registered mobile number. We erase the account and all its data, including
          uploaded files, within 30 days. We may keep minimal records where the law requires it.
          Full steps are on the <Link to="/delete-account" className="font-medium text-brand-purple underline underline-offset-2">Delete Account</Link> page.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under India’s Digital Personal Data Protection Act, 2023 and other applicable laws, you can ask
          to access, correct or erase your personal data, withdraw consent, and nominate someone to act
          for you. Most details can be edited directly in the app. For anything else, or to raise a
          grievance, contact our grievance officer at <EmailLink subject="Grievance" />. We respond within
          30 days.
        </p>
      </Section>

      <Section title="Children and family members">
        <p>
          Accounts are for adults aged 18 or over. A parent or guardian may add children and other
          family members to their account, and confirms that they have the authority to manage that
          person’s health information.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change this policy, we will update the date above. If the change is significant, we will
          also tell you in the app before it applies.
        </p>
      </Section>
    </LegalLayout>
  );
}
