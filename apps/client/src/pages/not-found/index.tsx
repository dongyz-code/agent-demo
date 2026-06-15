import { Link } from '@tanstack/react-router';
import LucideSearchX from '~icons/lucide/search-x';

import { PageHeader } from '@/components/PageHeader';

export function NotFoundPage() {
  return (
    <section className="max-w-2xl rounded border border-zinc-800 bg-zinc-900 p-6">
      <PageHeader
        title="Not Found"
        description="The page you requested does not exist."
        actions={<LucideSearchX className="size-5 text-zinc-400" aria-hidden />}
      />
      <Link to="/" className="text-sm text-emerald-300 hover:text-emerald-200">
        Back to dashboard
      </Link>
    </section>
  );
}
