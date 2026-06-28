import { Link } from '@tanstack/react-router';
import LucideSearchX from '~icons/lucide/search-x';

import { PageHeader } from '@/components/PageHeader';

/**
 * 渲染 404 页面。
 *
 * @returns 404 页面节点。
 */
export function NotFoundPage() {
  return (
    <section className="max-w-2xl rounded border border-app-border bg-app-surface p-6">
      <PageHeader
        title="Not Found"
        description="The page you requested does not exist."
        actions={<LucideSearchX className="size-5 text-app-muted" aria-hidden />}
      />
      <Link to="/" className="text-sm text-primary-3 hover:text-primary-2">
        Back to dashboard
      </Link>
    </section>
  );
}
