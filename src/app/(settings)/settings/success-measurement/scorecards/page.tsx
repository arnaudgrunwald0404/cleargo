import { redirect } from 'next/navigation';

export default function ScorecardsRedirectPage() {
  redirect('/admin/settings/success-measurement/scorecards');
}
