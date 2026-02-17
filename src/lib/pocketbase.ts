import PocketBase, { RecordModel } from "pocketbase";
import {
	useState,
	useEffect,
	useCallback,
	useRef,
	useSyncExternalStore,
} from "react";

// PocketBase URL - same origin in production (served by PocketBase),
// or explicit URL for development
const PB_URL =
	import.meta.env.VITE_POCKETBASE_URL || window.location.origin;

export const pb = new PocketBase(PB_URL);

// Disable auto-cancellation so concurrent requests don't cancel each other
pb.autoCancellation(false);

// ─── Auth Context ───────────────────────────────────────────────

export type AuthState = {
	isAuthenticated: boolean;
	user: RecordModel | null;
	token: string;
};

function getAuthSnapshot(): AuthState {
	return {
		isAuthenticated: pb.authStore.isValid,
		user: pb.authStore.record as RecordModel | null,
		token: pb.authStore.token,
	};
}

let authSnapshot = getAuthSnapshot();
const authListeners = new Set<() => void>();

pb.authStore.onChange(() => {
	authSnapshot = getAuthSnapshot();
	authListeners.forEach((l) => l());
});

export function useAuth(): AuthState {
	return useSyncExternalStore(
		(cb) => {
			authListeners.add(cb);
			return () => authListeners.delete(cb);
		},
		() => authSnapshot,
	);
}

export async function signIn(email: string, password: string) {
	return pb.collection("users").authWithPassword(email, password);
}

export async function signUp(email: string, password: string) {
	await pb.collection("users").create({
		email,
		password,
		passwordConfirm: password,
	});
	return signIn(email, password);
}

export function signOut() {
	pb.authStore.clear();
}

// ─── Real-time query hook ───────────────────────────────────────

type QueryOptions = {
	sort?: string;
	filter?: string;
	expand?: string;
	/** Maximum records to fetch (0 = all). Default: 200 */
	perPage?: number;
	/** Extra filter params for {:placeholder} bindings */
	filterParams?: Record<string, string>;
};

/**
 * Real-time collection query. Fetches initial data then subscribes
 * to SSE events for live updates.
 *
 * Returns `undefined` while loading, or the record array.
 */
export function usePBQuery<T extends RecordModel = RecordModel>(
	collection: string,
	options?: QueryOptions | "skip",
): T[] | undefined {
	const [records, setRecords] = useState<T[] | undefined>(undefined);
	const optionsRef = useRef(options);
	optionsRef.current = options;

	// Stable key for re-fetch on options change
	const key =
		options === "skip"
			? "skip"
			: JSON.stringify([
					collection,
					options?.sort,
					options?.filter,
					options?.expand,
					options?.perPage,
					options?.filterParams,
				]);

	useEffect(() => {
		if (key === "skip") {
			setRecords(undefined);
			return;
		}

		const opts = optionsRef.current as QueryOptions | undefined;
		let cancelled = false;

		// Build filter with param bindings
		let filter = opts?.filter || "";
		if (opts?.filterParams && filter) {
			for (const [k, v] of Object.entries(opts.filterParams)) {
				filter = filter.replace(`{:${k}}`, `'${v.replace(/'/g, "''")}'`);
			}
		}

		// Initial fetch
		pb.collection(collection)
			.getFullList<T>({
				sort: opts?.sort || undefined,
				filter: filter || undefined,
				expand: opts?.expand || undefined,
				batch: opts?.perPage || 200,
			})
			.then((data) => {
				if (!cancelled) setRecords(data);
			})
			.catch((err) => {
				if (!cancelled) {
					console.error(`[usePBQuery] ${collection}:`, err);
					setRecords([]);
				}
			});

		// Real-time subscription
		let unsubPromise: Promise<() => void> | null = null;
		try {
			unsubPromise = pb.collection(collection).subscribe<T>("*", (e) => {
				if (cancelled) return;
				setRecords((prev) => {
					if (!prev) return prev;
					switch (e.action) {
						case "create":
							return [...prev, e.record];
						case "update":
							return prev.map((r) =>
								r.id === e.record.id ? e.record : r,
							);
						case "delete":
							return prev.filter((r) => r.id !== e.record.id);
						default:
							return prev;
					}
				});
			});
		} catch {
			// SSE not available — polling fallback not needed for now
		}

		return () => {
			cancelled = true;
			unsubPromise?.then((unsub) => unsub());
		};
	}, [key, collection]);

	return records;
}

/**
 * Fetch a single record by ID with optional expand.
 * Returns undefined while loading, null if not found.
 */
export function usePBRecord<T extends RecordModel = RecordModel>(
	collection: string,
	id: string | null,
	options?: { expand?: string },
): T | null | undefined {
	const [record, setRecord] = useState<T | null | undefined>(undefined);
	const expand = options?.expand;

	useEffect(() => {
		if (!id) {
			setRecord(null);
			return;
		}

		let cancelled = false;

		pb.collection(collection)
			.getOne<T>(id, { expand: expand || undefined })
			.then((data) => {
				if (!cancelled) setRecord(data);
			})
			.catch(() => {
				if (!cancelled) setRecord(null);
			});

		// Subscribe to changes on this specific record
		let unsubPromise: Promise<() => void> | null = null;
		try {
			unsubPromise = pb.collection(collection).subscribe<T>(id, (e) => {
				if (cancelled) return;
				if (e.action === "delete") {
					setRecord(null);
				} else {
					setRecord(e.record);
				}
			});
		} catch {
			// SSE not available
		}

		return () => {
			cancelled = true;
			unsubPromise?.then((unsub) => unsub());
		};
	}, [collection, id, expand]);

	return record;
}

// ─── Mutation helpers ───────────────────────────────────────────

export function usePBCreate(collection: string) {
	return useCallback(
		async (data: Record<string, unknown>) => {
			return pb.collection(collection).create(data);
		},
		[collection],
	);
}

export function usePBUpdate(collection: string) {
	return useCallback(
		async (id: string, data: Record<string, unknown>) => {
			return pb.collection(collection).update(id, data);
		},
		[collection],
	);
}

export function usePBDelete(collection: string) {
	return useCallback(
		async (id: string) => {
			return pb.collection(collection).delete(id);
		},
		[collection],
	);
}

// ─── Types ──────────────────────────────────────────────────────

// PocketBase records always have created/updated but RecordModel doesn't declare them
type PBRecord = RecordModel & { created: string; updated: string };

export interface Agent extends PBRecord {
	name: string;
	role: string;
	status: "idle" | "active" | "blocked";
	level: "LEAD" | "INT" | "SPC";
	avatar: string;
	systemPrompt?: string;
	character?: string;
	lore?: string;
	tenantId: string;
	currentTaskId?: string;
	sessionKey?: string;
}

export interface Task extends PBRecord {
	title: string;
	description: string;
	status: string;
	assigneeIds: string[];
	tags: string[];
	borderColor?: string;
	sessionKey?: string;
	openclawRunId?: string;
	startedAt?: number;
	usedCodingTools?: boolean;
	tenantId: string;
	archived?: boolean;
}

export interface Message extends PBRecord {
	taskId: string;
	fromAgentId: string;
	content: string;
	attachments: string[];
	tenantId: string;
}

export interface Activity extends PBRecord {
	type: string;
	message: string;
	agentId: string;
	targetId?: string;
	tenantId: string;
}

export interface Document extends PBRecord {
	title: string;
	content: string;
	type: string;
	path?: string;
	taskId?: string;
	createdByAgentId?: string;
	messageId?: string;
	tenantId: string;
}
