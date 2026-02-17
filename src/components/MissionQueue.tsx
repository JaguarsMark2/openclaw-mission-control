import React, { useState } from "react";
import { IconArchive } from "@tabler/icons-react";
import { DEFAULT_TENANT_ID } from "../lib/tenant";
import { usePBQuery, pb } from "../lib/pocketbase";
import type { Task, Agent, Message } from "../lib/pocketbase";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	useSensor,
	useSensors,
	DragStartEvent,
	DragEndEvent,
} from "@dnd-kit/core";
import TaskCard from "./TaskCard";
import KanbanColumn from "./KanbanColumn";

type TaskStatus = "inbox" | "assigned" | "in_progress" | "review" | "done" | "archived";

interface EnrichedTask extends Task {
	lastMessageTime?: number;
}

function formatRelativeTime(timestamp: number | null): string {
	if (!timestamp) return "";

	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const columns = [
	{ id: "inbox", label: "INBOX", color: "var(--muted-foreground)" },
	{ id: "assigned", label: "ASSIGNED", color: "var(--accent-orange)" },
	{ id: "in_progress", label: "IN PROGRESS", color: "var(--accent-blue)" },
	{ id: "review", label: "REVIEW", color: "var(--accent-yellow)" },
	{ id: "done", label: "DONE", color: "var(--accent-green)" },
];

const archivedColumn = { id: "archived", label: "ARCHIVED", color: "var(--muted-foreground)" };

interface MissionQueueProps {
	selectedTaskId: string | null;
	onSelectTask: (id: string) => void;
}

const MissionQueue: React.FC<MissionQueueProps> = ({ selectedTaskId, onSelectTask }) => {
	const tasks = usePBQuery<Task>("tasks", {
		filter: "tenantId = {:tid}",
		filterParams: { tid: DEFAULT_TENANT_ID },
	});
	const agents = usePBQuery<Agent>("agents", {
		filter: "tenantId = {:tid}",
		filterParams: { tid: DEFAULT_TENANT_ID },
	});
	const [showArchived, setShowArchived] = useState(false);
	const [activeTask, setActiveTask] = useState<EnrichedTask | null>(null);

	const currentUserAgent = agents?.[0];

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		})
	);

	if (tasks === undefined || agents === undefined) {
		return (
			<main className="[grid-area:main] bg-secondary flex flex-col overflow-hidden animate-pulse">
				<div className="h-[65px] bg-card border-b border-border" />
				<div className="flex-1 grid grid-cols-5 gap-px bg-border">
					{[...Array(5)].map((_, i) => (
						<div key={i} className="bg-secondary" />
					))}
				</div>
			</main>
		);
	}

	const getAgentName = (id: string) => {
		return agents.find((a) => a.id === id)?.name || "Unknown";
	};

	const handleDragStart = (event: DragStartEvent) => {
		const task = tasks.find((t) => t.id === event.active.id);
		if (task) {
			setActiveTask(task as EnrichedTask);
		}
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveTask(null);

		if (!over || !currentUserAgent) return;

		const taskId = active.id as string;
		const newStatus = over.id as TaskStatus;
		const task = tasks.find((t) => t.id === taskId);

		if (task && task.status !== newStatus) {
			await pb.collection("tasks").update(taskId, { status: newStatus });
			await pb.collection("activity").create({
				type: "status_change",
				message: `Status changed to ${newStatus}`,
				agentId: currentUserAgent.id,
				targetId: taskId,
				tenantId: DEFAULT_TENANT_ID,
			});
		}
	};

	const handleArchive = async (taskId: string) => {
		if (currentUserAgent) {
			await pb.collection("tasks").update(taskId, { status: "archived" });
			await pb.collection("activity").create({
				type: "archive",
				message: "Task archived",
				agentId: currentUserAgent.id,
				targetId: taskId,
				tenantId: DEFAULT_TENANT_ID,
			});
		}
	};

	const buildAgentPreamble = (task: EnrichedTask) => {
		const assignee = task.assigneeIds.length > 0
			? agents.find(a => a.id === task.assigneeIds[0])
			: null;
		if (!assignee) return "";

		const parts: string[] = [];
		if (assignee.systemPrompt) parts.push(`System Prompt:\n${assignee.systemPrompt}`);
		if (assignee.character) parts.push(`Character:\n${assignee.character}`);
		if (assignee.lore) parts.push(`Lore:\n${assignee.lore}`);

		return parts.length > 0 ? parts.join("\n\n") + "\n\n---\n\n" : "";
	};

	const buildPrompt = async (task: EnrichedTask) => {
		let prompt = buildAgentPreamble(task);

		prompt += task.description && task.description !== task.title
			? `${task.title}\n\n${task.description}`
			: task.title;

		const messages = await pb.collection("messages").getFullList<Message>({
			filter: `tenantId = "${DEFAULT_TENANT_ID}" && taskId = "${task.id}"`,
			sort: "created",
		});
		if (messages && messages.length > 0) {
			const thread = messages.map(m => `[${m.fromAgentId}]: ${m.content}`).join("\n\n");
			prompt += `\n\n---\nConversation:\n${thread}\n---\nContinue working on this task based on the conversation above.`;
		}

		return prompt;
	};

	const triggerAgent = async (taskId: string, message: string) => {
		try {
			const res = await fetch("/api/hooks/agent", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${import.meta.env.VITE_OPENCLAW_HOOK_TOKEN || ""}`,
				},
				body: JSON.stringify({
					message,
					sessionKey: `mission:${taskId}`,
					name: "MissionControl",
					wakeMode: "now",
				}),
			});

			if (res.ok) {
				const data = await res.json();
				if (data.runId) {
					await pb.collection("tasks").update(taskId, {
						openclawRunId: data.runId,
						startedAt: Date.now(),
					});
				}
			}
		} catch (err) {
			console.error("[MissionQueue] Failed to trigger openclaw agent:", err);
		}
	};

	const handlePlay = async (taskId: string) => {
		if (!currentUserAgent) return;

		await pb.collection("tasks").update(taskId, { status: "in_progress" });
		await pb.collection("activity").create({
			type: "status_change",
			message: "Status changed to in_progress",
			agentId: currentUserAgent.id,
			targetId: taskId,
			tenantId: DEFAULT_TENANT_ID,
		});

		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;

		const message = await buildPrompt(task as EnrichedTask);
		await triggerAgent(taskId, message);
	};

	const displayColumns = showArchived ? [...columns, archivedColumn] : columns;
	const archivedCount = tasks.filter((t) => t.status === "archived").length;

		return (
			<main className="[grid-area:main] bg-secondary flex min-h-0 flex-col overflow-hidden">
				<div className="shrink-0 flex items-center justify-between px-6 py-5 bg-card border-b border-border">
				<div className="text-[11px] font-bold tracking-widest text-muted-foreground flex items-center gap-2">
					<span className="w-1.5 h-1.5 bg-[var(--accent-orange)] rounded-full" />{" "}
					MISSION QUEUE
				</div>
				<div className="flex gap-2">
					<div className="text-[11px] font-semibold px-3 py-1 rounded bg-muted text-muted-foreground flex items-center gap-1.5">
						<span className="text-sm">📦</span>{" "}
						{tasks.filter((t) => t.status === "inbox").length}
					</div>
					<div className="text-[11px] font-semibold px-3 py-1 rounded bg-muted text-muted-foreground">
						{tasks.filter((t) => t.status !== "done" && t.status !== "archived").length} active
					</div>
					<button
						onClick={() => setShowArchived(!showArchived)}
						className={`text-[11px] font-semibold px-3 py-1 rounded flex items-center gap-1.5 transition-colors ${
							showArchived
								? "bg-[var(--accent-blue)] text-white"
								: "bg-muted text-muted-foreground hover:bg-accent"
						}`}
					>
						<IconArchive size={14} />
						{showArchived ? "Hide Archived" : "Show Archived"}
						{archivedCount > 0 && (
							<span className={`px-1.5 rounded-full text-[10px] ${showArchived ? "bg-white/20" : "bg-muted-foreground/30"}`}>
								{archivedCount}
							</span>
						)}
					</button>
				</div>
			</div>

			<DndContext
				sensors={sensors}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
					<div className={`flex-1 min-h-0 grid gap-px bg-border overflow-x-auto overflow-y-hidden ${showArchived ? "grid-cols-6" : "grid-cols-5"}`}>
					{displayColumns.map((col) => (
						<KanbanColumn
							key={col.id}
							column={col}
							taskCount={tasks.filter((t) => t.status === col.id).length}
						>
							{tasks
								.filter((t) => t.status === col.id)
								.map((task) => (
									<TaskCard
										key={task.id}
										task={task as EnrichedTask}
										isSelected={selectedTaskId === task.id}
										onClick={() => onSelectTask(task.id)}
										getAgentName={getAgentName}
										formatRelativeTime={formatRelativeTime}
										columnId={col.id}
										currentUserAgentId={currentUserAgent?.id}
										onArchive={handleArchive}
										onPlay={handlePlay}
									/>
								))}
						</KanbanColumn>
					))}
				</div>

				<DragOverlay>
					{activeTask ? (
						<TaskCard
							task={activeTask}
							isSelected={false}
							onClick={() => {}}
							getAgentName={getAgentName}
							formatRelativeTime={formatRelativeTime}
							columnId={activeTask.status}
							isOverlay={true}
						/>
					) : null}
				</DragOverlay>
			</DndContext>
		</main>
	);
};

export default MissionQueue;
