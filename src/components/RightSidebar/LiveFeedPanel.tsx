import React, { useMemo, useState } from "react";
import { usePBQuery, type Agent, type Activity } from "../../lib/pocketbase";
import { DEFAULT_TENANT_ID } from "../../lib/tenant";

const filters = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "comments", label: "Comments" },
  { id: "decisions", label: "Decisions" },
  { id: "docs", label: "Docs" },
  { id: "status", label: "Status" },
];

const LiveFeedPanel: React.FC = () => {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  // Build filter dynamically
  const activitiesOptions = useMemo(() => {
    const parts: string[] = ["tenantId = {:tid}"];
    const params: Record<string, string> = { tid: DEFAULT_TENANT_ID };

    if (selectedType !== "all") {
      parts.push("type = {:type}");
      params.type = selectedType;
    }
    if (selectedAgentId) {
      parts.push("agentId = {:agentId}");
      params.agentId = selectedAgentId;
    }

    return {
      filter: parts.join(" && "),
      filterParams: params,
      sort: "-created",
    };
  }, [selectedType, selectedAgentId]);

  const rawActivities = usePBQuery<Activity>("activities", activitiesOptions);
  const agents = usePBQuery<Agent>("agents", {
    filter: "tenantId = {:tid}",
    filterParams: { tid: DEFAULT_TENANT_ID },
  });

  // Enrich activities with agentName client-side
  const activities = useMemo(() => {
    if (!rawActivities || !agents) return undefined;
    const agentMap = new Map(agents.map(a => [a.id, a]));
    return rawActivities.map(item => ({
      ...item,
      agentName: agentMap.get(item.agentId)?.name || "Unknown",
    }));
  }, [rawActivities, agents]);

  if (activities === undefined || agents === undefined) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden animate-pulse">
        <div className="flex-1 p-4 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <div
              key={f.id}
              onClick={() => setSelectedType(f.id)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border border-border cursor-pointer flex items-center gap-1 transition-colors ${
                selectedType === f.id
                  ? "bg-[var(--accent-orange)] text-white border-[var(--accent-orange)]"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <div
            onClick={() => setSelectedAgentId(undefined)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
              selectedAgentId === undefined
                ? "border-[var(--accent-orange)] text-[var(--accent-orange)] bg-card"
                : "border-border bg-card text-muted-foreground hover:bg-muted/50"
            }`}
          >
            All Agents
          </div>
          {agents.slice(0, 8).map((a) => (
            <div
              key={a.id}
              onClick={() => setSelectedAgentId(a.id)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer flex items-center gap-1 transition-colors ${
                selectedAgentId === a.id
                  ? "border-[var(--accent-orange)] text-[var(--accent-orange)] bg-card"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {a.name}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {activities.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 p-3 bg-secondary border border-border rounded-lg"
          >
            <div className="w-1.5 h-1.5 bg-[var(--accent-orange)] rounded-full mt-1.5 shrink-0" />
            <div className="text-xs leading-tight text-foreground">
              <span className="font-bold text-[var(--accent-orange)]">
                {item.agentName}
              </span>{" "}
              {item.message}
              <div className="text-[10px] text-muted-foreground mt-1">
                just now
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveFeedPanel;
