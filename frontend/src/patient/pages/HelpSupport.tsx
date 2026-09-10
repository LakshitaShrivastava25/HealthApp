import { useState } from 'react';
import { Mail, ChevronDown, LifeBuoy } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card } from '../components/ui';

const SUPPORT_EMAIL = 'support@healthnow.app';

const FAQS = [
  {
    q: 'How does the AI read my documents?',
    a: 'When you upload a document in Medical Locker, it\'s processed automatically to extract details like the date, hospital, and doctor. This uses Claude\'s AI, and needs a real API key configured on the backend — until that\'s set up, uploads still work but the extracted fields stay empty. You can always add or correct any field yourself using "Correct a field" on the document.',
  },
  {
    q: 'Who can see my medical records?',
    a: 'Only you, by default. A doctor can never browse your records — they have to request access to your profile specifically, and you have to approve that request yourself before they can see anything. You can revoke that access at any time from your side.',
  },
  {
    q: 'What does the Emergency Card actually share?',
    a: 'Only what you choose. On the Emergency Card page, each item — blood group, allergies, medications, emergency contact — has its own toggle. Whatever you turn off is genuinely left out of what a scanner sees, not just hidden in the display.',
  },
  {
    q: 'Can I add family members to my account?',
    a: 'Yes — use the profile switcher next to your name at the top of any page, then "Add family member." Each family member gets their own separate records, and you can switch between them anytime.',
  },
  {
    q: 'How do I delete a document or medicine I added by mistake?',
    a: 'Open the item (a document in Medical Locker, a medicine in Medicines) and look for a delete or remove option — most records support this, with a confirmation step first so nothing is removed by accident.',
  },
  {
    q: 'I can\'t log in — what should I check?',
    a: 'Login uses your phone number and a one-time code (OTP), no password. Make sure you\'re using the exact number your account is registered under, including the correct country code from the dropdown. If the code doesn\'t arrive, use "Change phone number" to try again.',
  },
  {
    q: 'Is my data actually secure?',
    a: 'Your records are tied to your account and never shown to anyone — including doctors — without your explicit approval. That said, this is still an actively developed product; if you have specific security questions, reach out using the contact option below.',
  },
];

export default function HelpSupport() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <Topbar title="Help & Support" subtitle="Get help or reach the HealthNow team" />
      <main className="p-8 max-w-3xl space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center">
              <Mail size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">Contact Support</p>
              <p className="text-xs text-ink-500">We typically reply within a day or two.</p>
            </div>
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=HealthNow Support Request`}
            className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-brand-purple hover:underline"
          >
            <Mail size={15} /> {SUPPORT_EMAIL}
          </a>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <LifeBuoy size={17} className="text-brand-purple" />
            <p className="text-sm font-semibold text-ink-900">Frequently Asked Questions</p>
          </div>
          <div className="divide-y divide-border">
            {FAQS.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between py-3.5 text-left"
                >
                  <span className="text-sm font-medium text-ink-900 pr-4">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-ink-500 shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {openIndex === i && <p className="text-sm text-ink-500 pb-4 pr-6 leading-relaxed">{item.a}</p>}
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
