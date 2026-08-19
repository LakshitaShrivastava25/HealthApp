import { Clock3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';

export default function PendingVerification() {
  const { doctor, refreshDoctor, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-warning-bg text-warning flex items-center justify-center mx-auto mb-4">
          <Clock3 size={26} />
        </div>
        <p className="font-bold text-ink-900 text-lg">Verification Pending</p>
        <p className="text-sm text-ink-500 mt-2">
          Thanks, Dr. {doctor?.full_name}. Your registration is with our team for review. You'll get access
          to patient records once an admin approves your account.
        </p>
        <div className="flex gap-2 mt-6 justify-center">
          <Button variant="secondary" onClick={() => refreshDoctor()}>
            Check status
          </Button>
          <Button variant="ghost" onClick={logout}>
            Logout
          </Button>
        </div>
      </Card>
    </div>
  );
}
