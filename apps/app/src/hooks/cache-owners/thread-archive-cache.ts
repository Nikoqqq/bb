import type { QueryClient } from "@tanstack/react-query";
import type { ThreadWithRuntime } from "@bb/domain";
import { threadQueryKey } from "../queries/query-keys";

export interface CachedThreadSnapshot {
  id: string;
  thread: ThreadWithRuntime | undefined;
}

interface CachedThreadSnapshotsArgs {
  queryClient: QueryClient;
  threadIds: readonly string[];
}

export function getCachedThreadSnapshots({
  queryClient,
  threadIds,
}: CachedThreadSnapshotsArgs): CachedThreadSnapshot[] {
  return threadIds.map((threadId) => ({
    id: threadId,
    thread: queryClient.getQueryData<ThreadWithRuntime>(
      threadQueryKey(threadId),
    ),
  }));
}
