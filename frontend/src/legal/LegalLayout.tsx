import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';

/**
 * Public, signed-out pages that the Play Store listing and both apps link to
 * (/privacy, /terms, /delete-account). Plain reading layout: no portal shell,
 * no auth, so the URL works for anyone who opens it.
 */

export const SUPPORT_EMAIL = 'hello@curapath.in';
export const LEGAL_UPDATED = '6 October 2026';

const PAGES = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Use' },
  { to: '/delete-account', label: 'Delete Account' },
];

export function EmailLink({ subject }: { subject?: string }) {
  const href = `mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  return (
    <a href={href} className="font-medium text-brand-purple underline underline-offset-2">
      {SUPPORT_EMAIL}
    </a>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface font-sans">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-teal">
              <HeartPulse size={20} className="text-white" />
            </span>
            <span className="text-lg font-bold text-ink-900">CuraPath</span>
          </Link>
          <nav className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm">
            {PAGES.map(({ to, label }) => (
              <Link key={to} to={to} className="text-ink-500 hover:text-ink-900">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">Last updated {LEGAL_UPDATED}</p>
        {children}
        <p className="mt-12 border-t border-border pt-6 text-sm text-ink-500">
          Questions? Write to <EmailLink />.
        </p>
      </main>
    </div>
  );
}
