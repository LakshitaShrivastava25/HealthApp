import { type LucideIcon } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, EmptyState } from '../components/ui';

export default function ComingSoon({
  title,
  subtitle,
  icon: Icon,
  note,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  note: string;
}) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      <main className="p-8">
        <Card>
          <EmptyState icon={<Icon size={24} />} title={`${title} is on the way`} note={note} />
        </Card>
      </main>
    </>
  );
}
