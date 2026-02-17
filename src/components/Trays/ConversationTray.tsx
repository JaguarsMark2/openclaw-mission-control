import React, { useMemo } from "react";
import { usePBRecord, usePBQuery, type Document, type Message, type Agent, type Task } from "../../lib/pocketbase";
import Markdown from "react-markdown";
import { DEFAULT_TENANT_ID } from "../../lib/tenant";

type ConversationTrayProps = {
  documentId: string;
  onClose: () => void;
  onOpenPreview: () => void;
};

const ConversationTray: React.FC<ConversationTrayProps> = ({
  documentId,
  onClose,
  onOpenPreview,
}) => {
  const document = usePBRecord<Document>("documents", documentId);

  const taskId = document?.taskId || null;

  const agents = usePBQuery<Agent>("agents", {
    filter: "tenantId = {:tid}",
    filterParams: { tid: DEFAULT_TENANT_ID },
  });

  const tasks = usePBQuery<Task>("tasks", taskId ? {
    filter: "tenantId = {:tid} && id = {:taskId}",
    filterParams: { tid: DEFAULT_TENANT_ID, taskId },
  } : "skip");

  const rawMessages = usePBQuery<Message>("messages", taskId ? {
    filter: "tenantId = {:tid} && taskId = {:taskId}",
    filterParams: { tid: DEFAULT_TENANT_ID, taskId },
    sort: "created",
  } : "skip");

  // Derive context from separate queries
  const task = tasks?.[0] || null;

  const agentMap = useMemo(() => {
    if (!agents) return new Map<string, Agent>();
    return new Map(agents.map(a => [a.id, a]));
  }, [agents]);

  const creatorAgent = document?.createdByAgentId ? agentMap.get(document.createdByAgentId) : null;

  const conversationMessages = useMemo(() => {
    if (!rawMessages) return [];
    return rawMessages.map(msg => {
      const agent = agentMap.get(msg.fromAgentId);
      return {
        ...msg,
        agentName: agent?.name || "Unknown",
        agentAvatar: agent?.avatar,
      };
    });
  }, [rawMessages, agentMap]);

  // Loading state
  if (document === undefined) {
    return (
      <div className="tray is-open">
        <div className="p-4 animate-pulse">
          <div className="h-8 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (document === null) {
    return (
      <div className="tray is-open">
        <div className="p-4 text-center text-muted-foreground">
          Document not found
        </div>
      </div>
    );
  }

  return (
    <div className="tray is-open">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground"
              aria-label="Close conversation tray"
            >
              ✕
            </button>
            <span className="text-[11px] font-bold tracking-widest text-muted-foreground">
              CONTEXT
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenPreview}
            className="text-[10px] font-semibold px-3 py-1.5 rounded bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90 transition-colors"
          >
            Open Preview
          </button>
        </div>

        {/* Document info */}
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {document.title}
          </h3>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
            {creatorAgent?.name && (
              <>
                <span className="text-[var(--accent-orange)] font-medium">
                  {creatorAgent.name}
                </span>
                <span>·</span>
              </>
            )}
            <span className="capitalize">{document.type}</span>
            {task?.title && (
              <>
                <span>·</span>
                <span className="truncate">Task: {task.title}</span>
              </>
            )}
          </div>
        </div>

        {/* Full conversation thread */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {/* Original prompt */}
            {task?.description && (
              <>
                <div className="text-[10px] font-bold tracking-widest text-muted-foreground mb-1">
                  PROMPT
                </div>
                <div className="p-3 bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 rounded-lg mb-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">👤</span>
                    <span className="text-xs font-semibold text-[var(--accent-blue)]">
                      User
                    </span>
                  </div>
                  <div className="text-xs text-foreground leading-relaxed markdown-content">
                    <Markdown>{task.description}</Markdown>
                  </div>
                </div>
              </>
            )}

            {/* Message thread */}
            {conversationMessages.length > 0 && (
              <>
                <div className="text-[10px] font-bold tracking-widest text-muted-foreground mb-1">
                  AGENT THREAD
                </div>
                {conversationMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 bg-secondary border border-border rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {msg.agentAvatar && (
                        <span className="text-lg">{msg.agentAvatar}</span>
                      )}
                      <span className="text-xs font-semibold text-[var(--accent-orange)]">
                        {msg.agentName}
                      </span>
                    </div>
                    <div className="text-xs text-foreground leading-relaxed markdown-content">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* No content message */}
            {!task?.description &&
              conversationMessages.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-muted-foreground text-sm">
                    No conversation history available
                  </div>
                  <div className="text-muted-foreground/60 text-xs mt-1">
                    This document was created without task context
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationTray;
