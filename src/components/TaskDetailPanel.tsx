import React, { useMemo, useState, useEffect } from "react";
import { usePBQuery, pb, type Agent, type Task, type Message, type Activity, type Document } from "../lib/pocketbase";
import { IconX, IconCheck, IconUser, IconTag, IconMessage, IconClock, IconFileText, IconCopy, IconCalendar, IconArchive, IconPlayerPlay } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { DEFAULT_TENANT_ID } from "../lib/tenant";

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
  onPreviewDocument?: (docId: string) => void;
}

const statusColors: Record<string, string> = {
  inbox: "var(--muted-foreground)",
  assigned: "var(--accent-orange)",
  in_progress: "var(--accent-blue)",
  review: "var(--accent-yellow)",
  done: "var(--accent-green)",
  archived: "var(--muted-foreground)",
};

const statusLabels: Record<string, string> = {
  inbox: "INBOX",
  assigned: "ASSIGNED",
  in_progress: "IN PROGRESS",
  review: "REVIEW",
  done: "DONE",
  archived: "ARCHIVED",
};

const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({ taskId, onClose, onPreviewDocument }) => {
  const tasks = usePBQuery<Task>("tasks", {
    filter: "tenantId = {:tid}",
    filterParams: { tid: DEFAULT_TENANT_ID },
  });
  const agents = usePBQuery<Agent>("agents", {
    filter: "tenantId = {:tid}",
    filterParams: { tid: DEFAULT_TENANT_ID },
  });
  const resources = usePBQuery<Document>("documents", taskId ? {
    filter: "tenantId = {:tid} && taskId = {:taskId}",
    filterParams: { tid: DEFAULT_TENANT_ID, taskId },
  } : "skip");
  const activities = usePBQuery<Activity>("activities", taskId ? {
    filter: "tenantId = {:tid} && targetId = {:taskId}",
    filterParams: { tid: DEFAULT_TENANT_ID, taskId },
    sort: "-created",
  } : "skip");
  const rawMessages = usePBQuery<Message>("messages", taskId ? {
    filter: "tenantId = {:tid} && taskId = {:taskId}",
    filterParams: { tid: DEFAULT_TENANT_ID, taskId },
  } : "skip");

  // Enrich messages with agent info client-side
  const messages = useMemo(() => {
    if (!rawMessages || !agents) return undefined;
    const agentMap = new Map(agents.map(a => [a.id, a]));
    return rawMessages.map(msg => {
      const agent = agentMap.get(msg.fromAgentId);
      return {
        ...msg,
        agentName: agent?.name || "Unknown",
        agentAvatar: agent?.avatar,
      };
    });
  }, [rawMessages, agents]);

  const task = tasks?.find((t) => t.id === taskId);
  const currentUserAgent = agents?.[0];

  const [description, setDescription] = useState("");
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Array<string>>([]);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState("note");
  const [newDocPath, setNewDocPath] = useState("");
  const [newDocContent, setNewDocContent] = useState("");

  useEffect(() => {
    if (task) {
      setDescription(task.description);
    }
  }, [task]);

  if (!taskId) return null;
  if (!task) return null;

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (currentUserAgent) {
      await pb.collection("tasks").update(task.id, {
        status: e.target.value,
      });
      await pb.collection("activities").create({
        type: "status",
        message: `changed status to ${e.target.value}`,
        agentId: currentUserAgent.id,
        targetId: task.id,
        tenantId: DEFAULT_TENANT_ID,
      });
    }
  };

  const handleAssigneeToggle = async (agentId: string) => {
    if (!currentUserAgent) return;
    const currentAssignees = task.assigneeIds || [];
    const isAssigned = currentAssignees.includes(agentId);

    let newAssignees;
    if (isAssigned) {
      newAssignees = currentAssignees.filter(id => id !== agentId);
    } else {
      newAssignees = [...currentAssignees, agentId];
    }
    await pb.collection("tasks").update(task.id, {
      assigneeIds: newAssignees,
    });
    await pb.collection("activities").create({
      type: "tasks",
      message: isAssigned ? `unassigned an agent` : `assigned an agent`,
      agentId: currentUserAgent.id,
      targetId: task.id,
      tenantId: DEFAULT_TENANT_ID,
    });
  };

  const saveDescription = async () => {
    if (currentUserAgent) {
      await pb.collection("tasks").update(task.id, {
        description,
      });
      await pb.collection("activities").create({
        type: "tasks",
        message: `updated task description`,
        agentId: currentUserAgent.id,
        targetId: task.id,
        tenantId: DEFAULT_TENANT_ID,
      });
      setIsEditingDesc(false);
    }
  };

  const docsById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof resources>[number]>();
    if (resources) {
      resources.forEach((doc) => {
        map.set(doc.id, doc);
      });
    }
    return map;
  }, [resources]);

  const sortedMessages = useMemo(() => {
    if (!messages) return [];
    return [...messages].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  }, [messages]);

  const toggleAttachment = (docId: string) => {
    setSelectedAttachmentIds((prev) => {
      if (prev.includes(docId)) {
        return prev.filter((id) => id !== docId);
      }
      return [...prev, docId];
    });
  };

  const sendComment = async () => {
    if (!currentUserAgent) return;
    const trimmed = commentText.trim();
    if (!trimmed) return;
    await pb.collection("messages").create({
      taskId: task.id,
      fromAgentId: currentUserAgent.id,
      content: trimmed,
      attachments: selectedAttachmentIds,
      tenantId: DEFAULT_TENANT_ID,
    });
    setCommentText("");
    setSelectedAttachmentIds([]);
  };

  const buildAgentPreamble = () => {
    if (!task || !agents) return "";
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

  const handleResume = async () => {
    if (!currentUserAgent || !task) return;

    const trimmed = commentText.trim();
    if (trimmed) {
      await pb.collection("messages").create({
        taskId: task.id,
        fromAgentId: currentUserAgent.id,
        content: trimmed,
        attachments: selectedAttachmentIds,
        tenantId: DEFAULT_TENANT_ID,
      });
      setCommentText("");
      setSelectedAttachmentIds([]);
    }

    await pb.collection("tasks").update(task.id, {
      status: "in_progress",
    });
    await pb.collection("activities").create({
      type: "status",
      message: `changed status to in_progress`,
      agentId: currentUserAgent.id,
      targetId: task.id,
      tenantId: DEFAULT_TENANT_ID,
    });

    let prompt = buildAgentPreamble();

    prompt += task.description && task.description !== task.title
      ? `${task.title}\n\n${task.description}`
      : task.title;

    const allMessages = sortedMessages.slice();
    if (trimmed) {
      allMessages.push({
        agentName: currentUserAgent.name,
        content: trimmed,
      } as any);
    }

    if (allMessages.length > 0) {
      const thread = allMessages.map(m => `[${(m as any).agentName}]: ${m.content}`).join("\n\n");
      prompt += `\n\n---\nConversation:\n${thread}\n---\nContinue working on this task based on the conversation above.`;
    }

    try {
      const res = await fetch("/api/hooks/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_OPENCLAW_HOOK_TOKEN || ""}`,
        },
        body: JSON.stringify({
          message: prompt,
          sessionKey: `mission:${task.id}`,
          name: "MissionControl",
          wakeMode: "now",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.runId) {
          await pb.collection("tasks").update(task.id, {
            openclawRunId: data.runId,
          });
        }
      }
    } catch (err) {
      console.error("[TaskDetailPanel] Failed to trigger openclaw agent:", err);
    }
  };

  const resetNewDocForm = () => {
    setNewDocTitle("");
    setNewDocType("note");
    setNewDocPath("");
    setNewDocContent("");
  };

  const submitNewDoc = async () => {
    if (!currentUserAgent) return;
    const trimmedTitle = newDocTitle.trim();
    if (!trimmedTitle) return;
    const doc = await pb.collection("documents").create({
      title: trimmedTitle,
      type: newDocType.trim() || "note",
      content: newDocContent.trim(),
      path: newDocPath.trim() || undefined,
      taskId: task.id,
      createdByAgentId: currentUserAgent.id,
      tenantId: DEFAULT_TENANT_ID,
    });
    setSelectedAttachmentIds((prev) => [...prev, doc.id]);
    resetNewDocForm();
    setIsAddingDoc(false);
  };

  const renderAvatar = (avatar?: string) => {
    if (!avatar) return <IconUser size={10} />;
    const isUrl = avatar.startsWith("http") || avatar.startsWith("data:");
    if (isUrl) {
      return <img src={avatar} className="w-full h-full object-cover" alt="avatar" />;
    }
    return <span className="text-[10px] flex items-center justify-center h-full w-full leading-none">{avatar}</span>;
  };

  const formatCreationDate = (ms: number) => {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const lastUpdatedActivity = activities?.[0];
  const lastUpdated = lastUpdatedActivity ? new Date(lastUpdatedActivity.created).getTime() : null;

  return (
    <div className="fixed inset-y-0 right-0 w-[380px] bg-card border-l border-border shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColors[task.status] || "gray" }}
          />
          <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
            {task.id.slice(-6)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors"
        >
          <IconX size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

        {/* Title */}
        <div>
          <h2 className="text-lg font-bold text-foreground leading-tight mb-1.5">
            {task.title}
          </h2>
          <div className="flex gap-2 mb-3">
            {task.tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 bg-muted rounded font-medium text-muted-foreground flex items-center gap-1">
                <IconTag size={10} /> {tag}
              </span>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            {task.status !== 'done' && task.status !== 'archived' && (
              <button
                  onClick={async () => {
                    if (currentUserAgent) {
                      await pb.collection("tasks").update(task.id, { status: "done" });
                      await pb.collection("activities").create({
                        type: "status",
                        message: "changed status to done",
                        agentId: currentUserAgent.id,
                        targetId: task.id,
                        tenantId: DEFAULT_TENANT_ID,
                      });
                    }
                  }}
                  disabled={!currentUserAgent}
                  className={`flex-1 py-1.5 bg-[var(--accent-green)] text-white rounded text-xs font-medium flex items-center justify-center gap-2 transition-opacity shadow-sm ${!currentUserAgent ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                  title={!currentUserAgent ? "User agent not found" : "Mark as Done"}
              >
                  <IconCheck size={16} />
                  Mark as Done
              </button>
            )}
            {task.status !== 'archived' && (
              <button
                  onClick={async () => {
                    if (currentUserAgent) {
                      await pb.collection("tasks").update(task.id, { status: "archived", archived: true });
                      await pb.collection("activities").create({
                        type: "status",
                        message: "archived task",
                        agentId: currentUserAgent.id,
                        targetId: task.id,
                        tenantId: DEFAULT_TENANT_ID,
                      });
                    }
                  }}
                  disabled={!currentUserAgent}
                  className={`${task.status === 'done' ? 'flex-1' : ''} py-1.5 px-3 bg-muted text-muted-foreground rounded text-xs font-medium flex items-center justify-center gap-2 transition-colors shadow-sm ${!currentUserAgent ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent'}`}
                  title={!currentUserAgent ? "User agent not found" : "Archive Task"}
              >
                  <IconArchive size={16} />
                  Archive
              </button>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Status</label>
          <select
            value={task.status}
            onChange={handleStatusChange}
            disabled={!currentUserAgent}
            className="w-full p-1.5 text-sm border border-border rounded bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] disabled:opacity-50"
          >
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-1 group">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
            {!isEditingDesc && currentUserAgent && (
              <button
                onClick={() => setIsEditingDesc(true)}
                className="text-[10px] text-[var(--accent-blue)] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Edit
              </button>
            )}
          </div>

          {isEditingDesc ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-[90px] p-2.5 text-sm border border-border rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditingDesc(false)}
                  className="px-3 py-1 text-xs text-muted-foreground hover:bg-muted rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDescription}
                  className="px-3 py-1 text-xs bg-foreground text-secondary rounded hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {task.description}
            </p>
          )}
        </div>

        {/* Assignees */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Assignees</label>
          <div className="flex flex-wrap gap-1.5">
            {task.assigneeIds?.map(id => {
              const agent = agents?.find(a => a.id === id);
              return (
                <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-card border border-border rounded-full shadow-sm">
                  <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                     {renderAvatar(agent?.avatar)}
                  </div>
                  <span className="text-xs font-medium text-foreground">{agent?.name || "Unknown"}</span>
                  <button
                    onClick={() => handleAssigneeToggle(id)}
                    disabled={!currentUserAgent}
                    className="hover:text-[var(--accent-red)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <IconX size={12} />
                  </button>
                </div>
              );
            })}
            <div className="relative group">
              <button
                disabled={!currentUserAgent}
                className="flex items-center gap-1 px-2 py-1 bg-muted border border-transparent rounded-full text-[11px] text-muted-foreground hover:bg-card hover:border-border transition-all disabled:opacity-50"
              >
                <span>+ Add</span>
              </button>

              {/* Dropdown for adding agents */}
              <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border shadow-lg rounded-lg hidden group-hover:block z-10 p-1">
                 {agents?.filter(a => !task.assigneeIds?.includes(a.id)).map(agent => (
                   <button
                    key={agent.id}
                    onClick={() => handleAssigneeToggle(agent.id)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded flex items-center gap-2"
                   >
                     <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                        {renderAvatar(agent.avatar)}
                     </div>
                     {agent.name}
                   </button>
                 ))}
                 {agents?.filter(a => !task.assigneeIds?.includes(a.id)).length === 0 && (
                   <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">No available agents</div>
                 )}
              </div>
            </div>
          </div>
        </div>

        {/* Resources / Deliverables */}
        {resources && resources.length > 0 && (
            <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Resources / Deliverables</label>
                <div className="space-y-1">
                    {resources.map((doc) => (
                        <div key={doc.id} onClick={() => onPreviewDocument?.(doc.id)} className="flex items-center justify-between p-1.5 bg-card border border-border rounded text-sm hover:bg-muted transition-colors cursor-pointer">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <IconFileText size={14} className="text-muted-foreground shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="truncate text-foreground font-medium">{doc.title}</span>
                                    {doc.path && <span className="text-[10px] text-muted-foreground truncate font-mono">{doc.path}</span>}
                                </div>
                            </div>
                            <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase self-start mt-0.5">{doc.type}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Comments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Comments</label>
            <button
              onClick={() => setIsAddingDoc((prev) => !prev)}
              disabled={!currentUserAgent}
              className="text-[10px] text-[var(--accent-blue)] disabled:opacity-50"
            >
              {isAddingDoc ? "Close Resource" : "Add Resource"}
            </button>
          </div>

          {sortedMessages.length === 0 && (
            <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded p-3">
              No comments yet. Start the conversation.
            </div>
          )}

          {sortedMessages.length > 0 && (
            <div className="space-y-2.5">
              {sortedMessages.map((msg) => (
                <div key={msg.id} className="flex gap-2 p-2.5 bg-card border border-border rounded">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {renderAvatar(msg.agentAvatar)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{msg.agentName}</span>
                      <span>{formatCreationDate(new Date(msg.created).getTime())}</span>
                    </div>
                    <div className="text-sm text-foreground markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.attachments?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.attachments.map((attachmentId) => {
                          const doc = docsById.get(attachmentId as string);
                          return (
                            <div
                              key={attachmentId}
                              className="text-[10px] px-2 py-0.5 bg-muted rounded border border-border text-muted-foreground flex items-center gap-1"
                            >
                              <IconFileText size={10} />
                              <span className="font-medium">{doc?.title || "Attachment"}</span>
                              {doc?.path && (
                                <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]">
                                  {doc.path}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attach existing resources */}
          {resources && resources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {resources.map((doc) => {
                const isSelected = selectedAttachmentIds.includes(doc.id);
                return (
                  <button
                    key={doc.id}
                    onClick={() => toggleAttachment(doc.id)}
                    disabled={!currentUserAgent}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      isSelected
                        ? "bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]"
                        : "bg-card text-muted-foreground border-border hover:bg-muted"
                    } disabled:opacity-50`}
                  >
                    {doc.title}
                  </button>
                );
              })}
            </div>
          )}

          {selectedAttachmentIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedAttachmentIds.map((id) => {
                const doc = docsById.get(id as string);
                return (
                  <div
                    key={id}
                    className="text-[10px] px-2 py-0.5 bg-secondary rounded text-muted-foreground flex items-center gap-1"
                  >
                    <IconFileText size={10} />
                    <span className="font-medium">{doc?.title || "Attachment"}</span>
                    <button
                      onClick={() => toggleAttachment(id)}
                      className="hover:text-foreground"
                      title="Remove attachment"
                    >
                      <IconX size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {isAddingDoc && (
            <div className="space-y-2 p-2.5 bg-muted/40 border border-border rounded">
              <div className="flex flex-col gap-2">
                <input
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="Document title"
                  className="w-full p-2 text-xs border border-border rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                />
                <div className="flex gap-2">
                  <input
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value)}
                    placeholder="Type (note, spec, link)"
                    className="flex-1 p-2 text-xs border border-border rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                  />
                  <input
                    value={newDocPath}
                    onChange={(e) => setNewDocPath(e.target.value)}
                    placeholder="Path (optional)"
                    className="flex-1 p-2 text-xs border border-border rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                  />
                </div>
                <textarea
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  placeholder="Content (optional)"
                  className="w-full min-h-[70px] p-2 text-xs border border-border rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      resetNewDocForm();
                      setIsAddingDoc(false);
                    }}
                    className="px-3 py-1 text-[10px] text-muted-foreground hover:bg-muted rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitNewDoc}
                    disabled={!currentUserAgent || !newDocTitle.trim()}
                    className="px-3 py-1 text-[10px] bg-foreground text-secondary rounded hover:opacity-90 disabled:opacity-50"
                  >
                    Add Resource
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={currentUserAgent ? "Write a comment..." : "Sign in as an agent to comment"}
              disabled={!currentUserAgent}
              className="w-full min-h-[80px] p-2.5 text-sm border border-border rounded bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] disabled:opacity-50"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={sendComment}
                disabled={!currentUserAgent || commentText.trim().length === 0}
                className="px-4 py-2 text-xs bg-[var(--accent-blue)] text-white rounded font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Send Comment
              </button>
              {task.status === "review" && (
                <button
                  onClick={handleResume}
                  disabled={!currentUserAgent}
                  className="px-4 py-2 text-xs bg-[var(--accent-green)] text-white rounded font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <IconPlayerPlay size={14} />
                  Resume
                </button>
              )}
            </div>
          </div>
        </div>

         {/* Meta */}
         <div className="mt-auto pt-6 border-t border-border flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <IconClock size={12} />
                    <span>Created {formatCreationDate(new Date(task.created).getTime())}</span>
                </div>
                {lastUpdated && (
                    <div className="flex items-center gap-2">
                         <IconCalendar size={12} />
                         <span>Updated {formatCreationDate(lastUpdated)}</span>
                    </div>
                )}
            </div>
             <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <IconMessage size={12} />
                    <span>{messages?.length || 0} comments</span>
                </div>
                 <div
                    className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => {
                        navigator.clipboard.writeText(task.id);
                    }}
                    title="Copy Task ID"
                 >
                     <span>ID: {task.id.slice(-6)}</span>
                     <IconCopy size={12} />
                </div>
            </div>
         </div>

      </div>
    </div>
  );
};

export default TaskDetailPanel;
