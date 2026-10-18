import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getCategories } from '@/api/custom-library';
import { MAX_API_PAGE_SIZE, nextPageNumber } from '@/utils/paged-list.logic';

/** Mutations invalidate the prefix ['landa-categories-all']. */
export const libraryCategoryOptionKeys = {
  all: ['landa-categories-all'] as const,
  tenant: (tenantId: string | null) => [...libraryCategoryOptionKeys.all, tenantId] as const,
};

/**
 * Library categories for pickers (document filter, bulk assign), in pages of
 * 100 with "load more". The picker used to ask for 200 at once, which the
 * backend caps at 100, so categories after the first 100 were silently missing.
 */
export function useLibraryCategoryOptions(tenantId: string | null) {
  const query = useInfiniteQuery({
    queryKey: libraryCategoryOptionKeys.tenant(tenantId),
    queryFn: ({ pageParam }) => getCategories({ page: pageParam, page_size: MAX_API_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => nextPageNumber(
      pages.map((page) => ({ rows: page.categories.length })),
      lastPage.total,
    ),
  });
  const categories = useMemo(() => query.data?.pages.flatMap((page) => page.categories) ?? [], [query.data]);
  const total = query.data?.pages[query.data.pages.length - 1]?.total ?? categories.length;
  return {
    categories,
    total,
    hasMore: Boolean(query.hasNextPage),
    loadingMore: query.isFetchingNextPage,
    loadMore: () => { void query.fetchNextPage(); },
  };
}
