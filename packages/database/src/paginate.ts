const PAGE_SIZE = 1000;

/**
 * Supabase-hosted PostgREST caps a single `select` at a project-level "Max
 * Rows" setting (1000 by default) — silently, no error, just a truncated
 * result. `listHealthMetrics`/`listSleepSessions`/`listActivities` have no
 * upper bound on how much history a user can accumulate (HealthKit imports
 * up to 3 years), so a single unpaginated request can't be trusted past that
 * cap. This walks `.range()` pages until a short page confirms the end.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
