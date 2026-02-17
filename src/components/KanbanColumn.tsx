import React from "react";
import { useDroppable } from "@dnd-kit/core";

interface Column {
	id: string;
	label: string;
	color: string;
}

interface KanbanColumnProps {
	column: Column;
	taskCount: number;
	children: React.ReactNode;
	isOver?: boolean;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
	column,
	taskCount,
	children,
}) => {
	const { isOver, setNodeRef } = useDroppable({
		id: column.id,
	});

	return (
		<div
			ref={setNodeRef}
			className={`bg-secondary flex flex-col min-w-[250px] min-h-0 transition-colors ${
				isOver ? "drop-zone-active" : ""
			}`}
		>
			<div className="flex shrink-0 items-center gap-2 px-4 py-3 bg-muted border-b border-border">
				<span
					className="w-2 h-2 rounded-full"
					style={{ backgroundColor: column.color }}
				/>
				<span className="text-[10px] font-bold text-muted-foreground flex-1 uppercase tracking-tighter">
					{column.label}
				</span>
				<span className="text-[10px] text-muted-foreground bg-border px-1.5 py-0.25 rounded-full">
					{taskCount}
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3">
				<div className="flex flex-col gap-3">
					{children}
				</div>
			</div>
		</div>
	);
};

export default KanbanColumn;
