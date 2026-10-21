import {
  notifyManager,
  replaceEqualDeep,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  beginOptimisticMutation,
  optimisticQueryUpdate,
  type TaggedOptimisticUpdate,
} from "@bb/query-tags";
import {
  threadWithRuntimeSchema,
  type ThreadListEntry,
  type ThreadWithRuntime,
} from "@bb/domain";
import type { ThreadResponse } from "@bb/server-contract";
import {
  ARCHIVED_THREADS_LIST_KIND,
  allThreadDetailBootstrapQueryKeyPrefix,
  allThreadEntitiesQueryKeyPrefix,
  allThreadQueryKeyPrefix,
  sidebarNavigationQueryKey,
  threadEntityQueryKey,
  threadSearchQueryKeyPrefix,
  threadsQueryKey,
} from "../queries/query-keys";

type Fields = Record<string, unknown>;
type ListFacetKey = Exclude<keyof ThreadListEntry, keyof ThreadWithRuntime>;
type DetailFacetKey = Exclude<keyof ThreadResponse, keyof ThreadWithRuntime>;
type Facet = "list" | "detail";

export interface ThreadEntity {
  thread: Partial<ThreadWithRuntime>;
  list: Partial<Pick<ThreadListEntry, ListFacetKey>> | null;
  detail: Partial<Pick<ThreadResponse, DetailFacetKey>> | null;
}

const LIST_FACET: Record<ListFacetKey, true> = {
  activity: true,
  queuedWork: true,
  pinSortKey: true,
  hasPendingInteraction: true,
  environmentHostId: true,
  environmentName: true,
  environmentBranchName: true,
  environmentPath: true,
  environmentProviderId: true,
  environmentIsWorktree: true,
  environmentWorkspaceDisplayKind: true,
};
const DETAIL_FACET: Record<DetailFacetKey, true> = {
  activeBackgroundAgentCount: true,
  canRestoreEnvironment: true,
  canEditMessages: true,
  canSpawnChild: true,
  queuedMessageCount: true,
};
const THREAD_KEYS = new Set(Object.keys(threadWithRuntimeSchema.shape));
const FACET_KEYS: Record<Facet, ReadonlySet<string>> = {
  list: new Set(Object.keys(LIST_FACET)),
  detail: new Set(Object.keys(DETAIL_FACET)),
};

type Membership = "active" | "archived" | "any";

interface ViewSlot {
  key: string;
  items: readonly unknown[];
}

interface ViewFamily {
  facet: Facet;
  membership(queryKey: QueryKey): Membership;
  slots(data: unknown): ViewSlot[] | undefined;
  rebuild(data: unknown, items: ReadonlyMap<string, unknown[]>): unknown;
  threadOf(item: unknown): Fields | undefined;
  withThread(item: unknown, thread: Fields): unknown;
}

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function threadRow(item: unknown): Fields | undefined {
  return isRecord(item) && typeof item.id === "string" ? item : undefined;
}

const ROW_ITEMS = {
  threadOf: threadRow,
  withThread: (_item: unknown, thread: Fields) => thread,
};

const SIDEBAR: ViewFamily = {
  facet: "list",
  membership: () => "active",
  slots(data) {
    if (!isRecord(data) || !isRecord(data.personalProject)) return undefined;
    const projects = Array.isArray(data.projects) ? data.projects : [];
    return [
      { key: "personal", items: projectThreads(data.personalProject) },
      ...projects.map((project, index) => ({
        key: `project:${index}`,
        items: projectThreads(project),
      })),
    ];
  },
  rebuild(data, items) {
    if (!isRecord(data) || !isRecord(data.personalProject)) return data;
    const projects = Array.isArray(data.projects) ? data.projects : [];
    return {
      ...data,
      personalProject: {
        ...data.personalProject,
        threads: items.get("personal") ?? [],
      },
      projects: projects.map((project: unknown, index) =>
        isRecord(project)
          ? { ...project, threads: items.get(`project:${index}`) ?? [] }
          : project,
      ),
    };
  },
  ...ROW_ITEMS,
};

function projectThreads(project: unknown): readonly unknown[] {
  return isRecord(project) && Array.isArray(project.threads)
    ? project.threads
    : [];
}

const THREAD_LISTS: ViewFamily = {
  facet: "list",
  membership(queryKey) {
    const scope = queryKey[1];
    if (scope === ARCHIVED_THREADS_LIST_KIND) return "archived";
    if (isRecord(scope) && typeof scope.archived === "boolean")
      return scope.archived ? "archived" : "active";
    return "any";
  },
  slots(data) {
    if (Array.isArray(data)) return [{ key: "rows", items: data }];
    if (isRecord(data) && Array.isArray(data.pages))
      return data.pages.map((page: unknown, index) => ({
        key: `page:${index}`,
        items: Array.isArray(page) ? page : [],
      }));
    if (isRecord(data) && Array.isArray(data.threads))
      return [{ key: "threads", items: data.threads }];
    return undefined;
  },
  rebuild(data, items) {
    if (Array.isArray(data)) return items.get("rows") ?? [];
    if (isRecord(data) && Array.isArray(data.pages))
      return {
        ...data,
        pages: data.pages.map(
          (_page: unknown, index) => items.get(`page:${index}`) ?? [],
        ),
      };
    if (isRecord(data)) return { ...data, threads: items.get("threads") ?? [] };
    return data;
  },
  ...ROW_ITEMS,
};

const SEARCH: ViewFamily = {
  facet: "list",
  membership: () => "any",
  slots(data) {
    if (!isRecord(data)) return undefined;
    return ["active", "archived"].map((key) => {
      const group = data[key];
      return {
        key,
        items:
          isRecord(group) && Array.isArray(group.results) ? group.results : [],
      };
    });
  },
  rebuild(data, items) {
    if (!isRecord(data)) return data;
    const next: Fields = { ...data };
    for (const key of ["active", "archived"]) {
      const group = data[key];
      if (isRecord(group))
        next[key] = { ...group, results: items.get(key) ?? [] };
    }
    return next;
  },
  threadOf: (item) => (isRecord(item) ? threadRow(item.thread) : undefined),
  withThread: (item, thread) => (isRecord(item) ? { ...item, thread } : item),
};

const DETAIL: ViewFamily = {
  facet: "detail",
  membership: () => "any",
  slots: (data) =>
    threadRow(data) === undefined ? undefined : [{ key: "detail", items: [data] }],
  rebuild: (data, items) => items.get("detail")?.[0] ?? data,
  ...ROW_ITEMS,
};

function familyOf(queryKey: QueryKey): ViewFamily | undefined {
  const [head] = queryKey;
  if (head === sidebarNavigationQueryKey()[0])
    return queryKey.length === 1 ? SIDEBAR : undefined;
  if (head === threadsQueryKey()[0])
    return queryKey.length > 1 ? THREAD_LISTS : undefined;
  if (head === threadSearchQueryKeyPrefix()[0]) return SEARCH;
  if (
    head === allThreadQueryKeyPrefix()[0] ||
    head === allThreadDetailBootstrapQueryKeyPrefix()[0]
  )
    return queryKey.length === 2 ? DETAIL : undefined;
  return undefined;
}

function pick(source: Fields, keys: ReadonlySet<string>): Fields {
  const picked: Fields = {};
  for (const key of Object.keys(source))
    if (keys.has(key)) picked[key] = source[key];
  return picked;
}

function withFields<T extends object>(
  current: T | null,
  fields: Fields,
): T | null {
  const keys = Object.keys(fields);
  if (keys.length === 0) return current;
  const base: Fields = current === null ? {} : { ...current };
  if (
    current !== null &&
    keys.every((key) => Object.is(Reflect.get(current, key), fields[key]))
  )
    return current;
  for (const key of keys) base[key] = fields[key];
  return base as T;
}

function mergeEntity(
  current: ThreadEntity,
  threadFields: Fields,
  facet: Facet,
  facetFields: Fields,
): ThreadEntity {
  const thread = withFields(current.thread, threadFields) ?? current.thread;
  const facetValue = withFields(current[facet], facetFields);
  if (thread === current.thread && facetValue === current[facet])
    return current;
  return { ...current, thread, [facet]: facetValue };
}

function isMember(entity: ThreadEntity, membership: Membership): boolean {
  if (membership === "any" || !("archivedAt" in entity.thread)) return true;
  const archived = entity.thread.archivedAt != null;
  return membership === "archived" ? archived : !archived;
}

interface ViewEntry {
  id: string | null;
  item: unknown;
}

interface ViewSkeleton {
  family: ViewFamily;
  data: unknown;
  slots: Map<string, ViewEntry[]>;
}

interface Materialized {
  byId: Map<string, unknown>;
  visibleBySlot: Map<string, Set<string>>;
}

interface ThreadEntityStore {
  client: QueryClient;
  skeletons: Map<Query, ViewSkeleton>;
  viewsById: Map<string, Set<Query>>;
  materialized: WeakMap<Query, Materialized>;
  fetchStartedAt: WeakMap<Query, number>;
  acknowledgedAt: Map<string, number>;
  rows: WeakMap<object, WeakMap<ThreadEntity, unknown>>;
  clock: number;
  batching: number;
  dirtyIds: Set<string>;
  dirtyViews: Set<Query>;
}

const stores = new WeakMap<QueryClient, ThreadEntityStore>();

function readEntity(
  store: ThreadEntityStore,
  id: string,
): ThreadEntity | undefined {
  return store.client.getQueryData<ThreadEntity>(threadEntityQueryKey(id));
}

function isNewer(
  incoming: unknown,
  current: unknown,
  readStart: number,
  acknowledgedAt: number,
): boolean {
  if (typeof incoming !== "number" || typeof current !== "number") return true;
  if (incoming !== current) return incoming > current;
  return readStart > acknowledgedAt;
}

function ingest(
  store: ThreadEntityStore,
  id: string,
  facet: Facet,
  source: Fields,
  readStart: number,
): void {
  const acknowledgedAt = store.acknowledgedAt.get(id) ?? -1;
  const threadFields = pick(source, THREAD_KEYS);
  const facetFields = pick(source, FACET_KEYS[facet]);
  store.client.setQueryData<ThreadEntity>(threadEntityQueryKey(id), (current) => {
    if (current === undefined)
      return {
        thread: threadFields,
        list: facet === "list" ? facetFields : null,
        detail: facet === "detail" ? facetFields : null,
      };
    return isNewer(
      threadFields.updatedAt,
      current.thread.updatedAt,
      readStart,
      acknowledgedAt,
    )
      ? mergeEntity(current, threadFields, facet, facetFields)
      : current;
  });
}

function applyChangedFields(
  store: ThreadEntityStore,
  id: string,
  facet: Facet,
  next: Fields,
  previous: Fields,
): void {
  const changed: Fields = {};
  for (const key of Object.keys(next))
    if (!Object.is(next[key], previous[key])) changed[key] = next[key];
  const threadFields = pick(changed, THREAD_KEYS);
  const facetFields = pick(changed, FACET_KEYS[facet]);
  if (
    Object.keys(threadFields).length === 0 &&
    Object.keys(facetFields).length === 0
  )
    return;
  store.client.setQueryData<ThreadEntity>(threadEntityQueryKey(id), (current) =>
    current === undefined
      ? current
      : mergeEntity(current, threadFields, facet, facetFields),
  );
}

function materializeItem(
  store: ThreadEntityStore,
  family: ViewFamily,
  item: unknown,
  entity: ThreadEntity,
): unknown {
  const source = family.threadOf(item);
  if (source === undefined || !isRecord(item)) return item;
  let byEntity = store.rows.get(item);
  if (byEntity === undefined) {
    byEntity = new WeakMap();
    store.rows.set(item, byEntity);
  }
  const cached = byEntity.get(entity);
  if (cached !== undefined) return cached;
  const row = family.withThread(item, {
    ...source,
    ...entity.thread,
    ...entity[family.facet],
  });
  byEntity.set(entity, row);
  return row;
}

function rematerialize(store: ThreadEntityStore, query: Query): void {
  const skeleton = store.skeletons.get(query);
  if (skeleton === undefined) return;
  const membership = skeleton.family.membership(query.queryKey);
  const items = new Map<string, unknown[]>();
  const visibleBySlot = new Map<string, Set<string>>();
  for (const [slot, entries] of skeleton.slots) {
    const visible = new Set<string>();
    const rows: unknown[] = [];
    for (const entry of entries) {
      if (entry.id === null) {
        rows.push(entry.item);
        continue;
      }
      const entity = readEntity(store, entry.id);
      if (entity !== undefined && !isMember(entity, membership)) continue;
      visible.add(entry.id);
      rows.push(
        entity === undefined
          ? entry.item
          : materializeItem(store, skeleton.family, entry.item, entity),
      );
    }
    items.set(slot, rows);
    visibleBySlot.set(slot, visible);
  }
  const next = replaceEqualDeep(
    query.state.data,
    skeleton.family.rebuild(skeleton.data, items),
  );
  const byId = new Map<string, unknown>();
  for (const slot of skeleton.family.slots(next) ?? [])
    for (const item of slot.items) {
      const thread = skeleton.family.threadOf(item);
      if (thread !== undefined) byId.set(String(thread.id), item);
    }
  store.materialized.set(query, { byId, visibleBySlot });
  if (next !== query.state.data) query.setState({ data: next });
}

function setSkeleton(
  store: ThreadEntityStore,
  query: Query,
  skeleton: ViewSkeleton | undefined,
): void {
  const previousIds = skeletonIds(store.skeletons.get(query));
  const nextIds = skeletonIds(skeleton);
  if (skeleton === undefined) {
    store.skeletons.delete(query);
    store.materialized.delete(query);
  } else store.skeletons.set(query, skeleton);
  for (const id of nextIds) {
    let views = store.viewsById.get(id);
    if (views === undefined) {
      views = new Set();
      store.viewsById.set(id, views);
    }
    views.add(query);
  }
  for (const id of previousIds) {
    if (nextIds.has(id)) continue;
    const views = store.viewsById.get(id);
    views?.delete(query);
    if (views === undefined || views.size === 0) {
      store.viewsById.delete(id);
      store.client.removeQueries({
        queryKey: threadEntityQueryKey(id),
        exact: true,
      });
    }
  }
}

function skeletonIds(skeleton: ViewSkeleton | undefined): Set<string> {
  const ids = new Set<string>();
  for (const entries of skeleton?.slots.values() ?? [])
    for (const { id } of entries) if (id !== null) ids.add(id);
  return ids;
}

function isHidden(entry: ViewEntry, visible: ReadonlySet<string>): boolean {
  return entry.id !== null && !visible.has(entry.id);
}

function keepHiddenEntries(
  previous: readonly ViewEntry[],
  next: ViewEntry[],
  visible: ReadonlySet<string>,
): ViewEntry[] {
  if (!previous.some((entry) => isHidden(entry, visible))) return next;
  const result = [...next];
  let insertAt = result.length;
  for (let index = previous.length - 1; index >= 0; index--) {
    const entry = previous[index]!;
    const existing =
      entry.id === null ? -1 : result.findIndex(({ id }) => id === entry.id);
    if (existing >= 0) insertAt = existing;
    else if (isHidden(entry, visible)) result.splice(insertAt, 0, entry);
  }
  return result;
}

function batch(store: ThreadEntityStore, run: () => void): void {
  store.batching++;
  try {
    notifyManager.batch(run);
  } finally {
    store.batching--;
  }
  if (store.batching > 0) return;
  const views = new Set(store.dirtyViews);
  for (const id of store.dirtyIds)
    for (const view of store.viewsById.get(id) ?? []) views.add(view);
  store.dirtyIds.clear();
  store.dirtyViews.clear();
  notifyManager.batch(() => {
    for (const view of views) rematerialize(store, view);
  });
}

function onViewWritten(
  store: ThreadEntityStore,
  query: Query,
  family: ViewFamily,
  manual: boolean,
): void {
  const data = query.state.data;
  const slots = data === undefined ? undefined : family.slots(data);
  if (slots === undefined) {
    setSkeleton(store, query, undefined);
    return;
  }
  const previous = store.skeletons.get(query);
  const materialized = manual ? store.materialized.get(query) : undefined;
  const readStart = manual
    ? Number.POSITIVE_INFINITY
    : (store.fetchStartedAt.get(query) ?? 0);
  batch(store, () => {
    const nextSlots = new Map<string, ViewEntry[]>();
    for (const slot of slots) {
      const entries: ViewEntry[] = [];
      for (const item of slot.items) {
        const thread = family.threadOf(item);
        if (thread === undefined) {
          entries.push({ id: null, item });
          continue;
        }
        const id = String(thread.id);
        entries.push({ id, item });
        const prior = materialized?.byId.get(id);
        const priorThread =
          prior === undefined ? undefined : family.threadOf(prior);
        if (priorThread !== undefined) {
          if (prior !== item)
            applyChangedFields(store, id, family.facet, thread, priorThread);
        } else ingest(store, id, family.facet, thread, readStart);
      }
      const previousEntries = previous?.slots.get(slot.key);
      const visible = materialized?.visibleBySlot.get(slot.key);
      nextSlots.set(
        slot.key,
        previousEntries !== undefined && visible !== undefined
          ? keepHiddenEntries(previousEntries, entries, visible)
          : entries,
      );
    }
    setSkeleton(store, query, { family, data, slots: nextSlots });
    store.dirtyViews.add(query);
  });
}

export function ensureThreadEntityStore(client: QueryClient): void {
  if (stores.has(client)) return;
  const store: ThreadEntityStore = {
    client,
    skeletons: new Map(),
    viewsById: new Map(),
    materialized: new WeakMap(),
    fetchStartedAt: new WeakMap(),
    acknowledgedAt: new Map(),
    rows: new WeakMap(),
    clock: 0,
    batching: 0,
    dirtyIds: new Set(),
    dirtyViews: new Set(),
  };
  stores.set(client, store);
  client.setQueryDefaults(allThreadEntitiesQueryKeyPrefix(), {
    gcTime: Infinity,
  });
  const entityHead = allThreadEntitiesQueryKeyPrefix()[0];
  client.getQueryCache().subscribe((event) => {
    const { query } = event;
    if (query.queryKey[0] === entityHead) {
      if (event.type !== "updated") return;
      const id = String(query.queryKey[1]);
      if (store.batching > 0) {
        store.dirtyIds.add(id);
        return;
      }
      notifyManager.batch(() => {
        for (const view of store.viewsById.get(id) ?? [])
          rematerialize(store, view);
      });
      return;
    }
    const family = familyOf(query.queryKey);
    if (family === undefined) return;
    if (event.type === "removed") {
      setSkeleton(store, query, undefined);
      return;
    }
    if (event.type !== "updated") return;
    if (event.action.type === "fetch") {
      store.fetchStartedAt.set(query, ++store.clock);
      return;
    }
    if (event.action.type === "success")
      onViewWritten(store, query, family, event.action.manual === true);
  });
  for (const query of client.getQueryCache().getAll()) {
    const family = familyOf(query.queryKey);
    if (family !== undefined && query.state.data !== undefined)
      onViewWritten(store, query, family, true);
  }
}

export function acknowledgeThreadEntities(
  client: QueryClient,
  threadIds: Iterable<string>,
): void {
  const store = stores.get(client);
  if (store === undefined) return;
  for (const id of threadIds) store.acknowledgedAt.set(id, ++store.clock);
}

export function getThreadEntities(client: QueryClient): ThreadEntity[] {
  return client
    .getQueriesData<ThreadEntity>({
      queryKey: allThreadEntitiesQueryKeyPrefix(),
    })
    .flatMap(([, entity]) => (entity === undefined ? [] : [entity]));
}

export function predictThreadEntity<Result = unknown>(
  threadId: string,
  update: (
    entity: ThreadEntity,
    result: { value: Result } | undefined,
  ) => ThreadEntity,
): TaggedOptimisticUpdate {
  return optimisticQueryUpdate<ThreadEntity, Result>(
    threadEntityQueryKey(threadId),
    update,
  );
}

export function pickThreadFields(
  thread: ThreadWithRuntime,
): Partial<ThreadWithRuntime> {
  return pick(thread, THREAD_KEYS);
}

export interface ThreadEntityPrediction {
  succeed(result?: unknown): void;
  fail(): void;
}

export function beginThreadEntityPrediction(
  client: QueryClient,
  optimistic: readonly TaggedOptimisticUpdate[],
): ThreadEntityPrediction {
  ensureThreadEntityStore(client);
  const prediction = beginOptimisticMutation(client, optimistic);
  return {
    succeed(result) {
      prediction.accept(result);
      prediction.settle();
    },
    fail: () => prediction.rollback(),
  };
}
