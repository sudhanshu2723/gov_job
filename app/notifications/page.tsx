import Triage from '@/components/Triage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications · Exam Atlas' };

export default function Page() {
  return <Triage mode="inbox" />;
}
