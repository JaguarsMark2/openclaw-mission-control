import React, { useMemo, useState } from "react";
import { usePBQuery, type Agent, type Document } from "../../lib/pocketbase";
import { DEFAULT_TENANT_ID } from "../../lib/tenant";

const typeFilters = [
  { id: "all", label: "All" },
  { id: "markdown", label: "Markdown" },
  { id: "code", label: "Code" },
  { id: "image", label: "Images" },
  { id: "note", label: "Notes" },
];

type DocumentsPanelProps = {
  selectedDocumentId: string | null;
  onSelectDocument: (id: string | null) => void;
  onPreviewDocument: (id: string) => void;
};

const DocumentsPanel: React.FC<DocumentsPanelProps> = ({
  selectedDocumentId,
  onSelectDocument,
  onPreviewDocument,
}) => {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  // Build filter dynamically
  const documentsOptions = useMemo(() => {
    const parts: string[] = ["tenantId = {:tid}"];
    const params: Record<string, string> = { tid: DEFAULT_TENANT_ID };

    if (selectedType !== "all") {
      parts.push("type = {:type}");
      params.type = selectedType;
    }
    if (selectedAgentId) {
      parts.push("createdByAgentId = {:agentId}");
      params.agentId = selectedAgentId;
    }

    return {
      filter: parts.join(" && "),
      filterParams: params,
      sort: "-created",
    };
  }, [selectedType, selectedAgentId]);

  const rawDocuments = usePBQuery<Document>("documents", documentsOptions);
  const agents = usePBQuery<Agent>("agents", {
    filter: "tenantId = {:tid}",
    filterParams: { tid: DEFAULT_TENANT_ID },
  });

  // Enrich documents with agent info client-side
  const documents = useMemo(() => {
    if (!rawDocuments || !agents) return undefined;
    const agentMap = new Map(agents.map(a => [a.id, a]));
    return rawDocuments.map(doc => ({
      ...doc,
      agentName: doc.createdByAgentId ? agentMap.get(doc.createdByAgentId)?.name : undefined,
      agentAvatar: doc.createdByAgentId ? agentMap.get(doc.createdByAgentId)?.avatar : undefined,
    }));
  }, [rawDocuments, agents]);

  const handleDocumentClick = (docId: string) => {
    if (selectedDocumentId === docId) {
      // Clicking same document again - close trays
      onSelectDocument(null);
    } else {
      // Click opens both conversation and preview
      onSelectDocument(docId);
    }
  };

  if (documents === undefined || agents === undefined) {
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "markdown":
        return "M";
      case "code":
        return "</>";
      case "image":
        return "IMG";
      case "note":
        return "N";
      default:
        return "D";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "markdown":
        return "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]";
      case "code":
        return "bg-[var(--accent-green)]/20 text-[var(--accent-green)]";
      case "image":
        return "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]";
      case "note":
        return "bg-[var(--accent-yellow)]/20 text-[var(--accent-yellow)]";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {typeFilters.map((f) => (
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

      <div className="flex flex-col gap-2">
        {documents.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No documents found
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => handleDocumentClick(doc.id)}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedDocumentId === doc.id
                  ? "bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]"
                  : "bg-secondary border-border hover:bg-muted"
              }`}
            >
              <div
                className={`shrink-0 w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold ${getTypeColor(doc.type)}`}
              >
                {getTypeIcon(doc.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {doc.title}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                  {doc.agentName && (
                    <span className="text-[var(--accent-orange)]">
                      {doc.agentName}
                    </span>
                  )}
                  <span>{doc.type}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewDocument(doc.id);
                }}
                className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                Preview
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DocumentsPanel;
