import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';

import LucideSearchX from '~icons/lucide/search-x';

/**
 * 渲染 404 页面。
 *
 * @returns 404 页面节点。
 */
export function NotFoundPage() {
  return (
    <section className="max-w-2xl rounded border border-border bg-card p-6">
      <PageHeader
        title="Not Found"
        description="The page you requested does not exist."
        actions={
          <LucideSearchX className="size-5 text-muted-foreground" aria-hidden />
        }
      />
      <Link to="/" className="text-sm text-link hover:text-link/80">
        Back to dashboard
      </Link>
    </section>
  );
}
