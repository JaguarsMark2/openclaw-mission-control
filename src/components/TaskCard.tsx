import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { IconArchive, IconPlayerPlay, IconLoader2 } from "@tabler/icons-react";

interface Task {
	id: string;
	title: string;
	description: string;
	status: string;
	assigneeIds: string[];
	tags: string[];
	borderColor?: string;
	lastMessageTime?: number;
}

interface TaskCardProps {
	task: Task;
	isSelected: boolean;
	onClick: () => void;
	getAgentName: (id: string) => string;
	formatRelativeTime: (timestamp: number | null) => string;
	columnId: string;
	currentUserAgentId?: string;
	onArchive?: (taskId: string) => void;
	onPlay?: (taskId: string) => void;
	isOverlay?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
	task,
	isSelected,
	onClick,
	getAgentName,
	formatRelativeTime,
	columnId,
	currentUserAgentId,
	onArchive,
	onPlay,
	isOverlay = false,
}) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		isDragging,
	} = useDraggable({
		id: task.id,
		data: { task },
	});

	const style = transform
		? {
				transform: CSS.Translate.toString(transform),
		  }
		: undefined;

	return (
		<div
			ref={setNodeRef}
			style={{
				...style,
				borderLeft:
					isSelected || isOverlay
						? undefined
						: `4px solid ${task.borderColor || "transparent"}`,
			}}
				className={`min-w-0 bg-card rounded-lg p-3 sm:p-4 shadow-sm flex flex-col gap-3 border transition-all cursor-pointer select-none ${
				isDragging ? "dragging-card" : "hover:-translate-y-0.5 hover:shadow-md"
			} ${
				isSelected
					? "ring-2 ring-[var(--accent-blue)] border-transparent"
					: "border-border"
			} ${columnId === "archived" ? "opacity-60" : ""} ${
				columnId === "in_progress" ? "card-running" : ""
			} ${isOverlay ? "drag-overlay" : ""}`}
			onClick={onClick}
			{...listeners}
			{...attributes}
		>
			<div className="flex justify-between text-muted-foreground text-sm">
				<span className="text-base">↑</span>
				<div className="flex items-center gap-2">
					{(columnId === "inbox" || columnId === "assigned") && currentUserAgentId && onPlay && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onPlay(task.id);
							}}
							className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-[var(--accent-blue)]"
							title="Start task"
						>
							<IconPlayerPlay size={14} />
						</button>
					)}
					{columnId === "in_progress" && (
						<span className="p-1 text-[var(--accent-blue)]" title="Running">
							<IconLoader2 size={14} className="animate-spin" />
						</span>
					)}
					{columnId === "done" && currentUserAgentId && onArchive && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onArchive(task.id);
							}}
							className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
							title="Archive task"
						>
							<IconArchive size={14} />
						</button>
					)}
					<span className="tracking-widest">...</span>
				</div>
			</div>
				<h3 className="text-sm font-semibold text-foreground leading-tight break-words">
					{task.title}
				</h3>
				<p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 break-words">
					{task.description}
				</p>
			<div className="flex justify-between items-center mt-1">
				{task.assigneeIds && task.assigneeIds.length > 0 && (
					<div className="flex items-center gap-1.5">
						<span className="text-xs">👤</span>
						<span className="text-[11px] font-semibold text-foreground">
							{getAgentName(task.assigneeIds[0])}
						</span>
					</div>
				)}
				{task.lastMessageTime && (
					<span className="text-[11px] text-muted-foreground">
						{formatRelativeTime(task.lastMessageTime)}
					</span>
				)}
			</div>
			<div className="flex flex-wrap gap-1.5">
				{task.tags.map((tag) => (
					<span
						key={tag}
						className="text-[10px] px-2 py-0.5 bg-muted rounded font-medium text-muted-foreground"
					>
						{tag}
					</span>
				))}
			</div>
		</div>
	);
};

export default TaskCard;
