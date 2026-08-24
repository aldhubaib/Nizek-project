"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SprintBoard,
  type SprintData,
  type PickerTask,
} from "@/components/project/sprint-board";
import {
  getSprints,
  getSprintWithItems,
  createSprint,
  startSprint,
  stopSprint,
  addTaskToSprint,
  removeTaskFromSprint,
  moveSprintItem,
  getProjectTasksForSprintPicker,
} from "@/actions/sprint";
import type { RoadmapStatus } from "@/lib/roadmap-status";

interface SprintTabProps {
  projectId: string;
  canEdit: boolean;
}

interface SprintListItem {
  id: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";
  _count: { items: number };
}

export function SprintTab({ projectId, canEdit }: SprintTabProps) {
  const [sprints, setSprints] = useState<SprintListItem[]>([]);
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [sprintData, setSprintData] = useState<SprintData | null>(null);
  const [availableTasks, setAvailableTasks] = useState<PickerTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadSprints = useCallback(async () => {
    const list = await getSprints(projectId);
    setSprints(list as SprintListItem[]);

    const active = list.find((s) => s.status === "ACTIVE");
    const planning = list.find((s) => s.status === "PLANNING");
    const defaultSprint = active ?? planning ?? list[0];

    if (defaultSprint && !activeSprintId) {
      setActiveSprintId(defaultSprint.id);
    }
    setLoading(false);
  }, [projectId, activeSprintId]);

  const loadSprintData = useCallback(async (sprintId: string) => {
    const data = await getSprintWithItems(sprintId);
    setSprintData(data as unknown as SprintData);
  }, []);

  const loadAvailableTasks = useCallback(
    async (sprintId: string) => {
      setLoadingTasks(true);
      const tasks = await getProjectTasksForSprintPicker(projectId, sprintId);
      setAvailableTasks(tasks as PickerTask[]);
      setLoadingTasks(false);
    },
    [projectId],
  );

  useEffect(() => {
    loadSprints();
  }, [loadSprints]);

  useEffect(() => {
    if (activeSprintId) {
      loadSprintData(activeSprintId);
      loadAvailableTasks(activeSprintId);
    }
  }, [activeSprintId, loadSprintData, loadAvailableTasks]);

  async function handleCreateSprint() {
    startTransition(async () => {
      const sprint = await createSprint(projectId);
      setActiveSprintId(sprint.id);
      await loadSprints();
    });
  }

  async function handleStartSprint(workingDays: number) {
    if (!activeSprintId) return;
    await startSprint(activeSprintId, workingDays);
    await loadSprintData(activeSprintId);
    await loadSprints();
  }

  async function handleStopSprint() {
    if (!activeSprintId) return;
    await stopSprint(activeSprintId);
    await loadSprintData(activeSprintId);
    await loadSprints();
  }

  async function handleAddTasks(taskIds: string[]) {
    if (!activeSprintId) return;
    for (const taskId of taskIds) {
      await addTaskToSprint(activeSprintId, taskId);
    }
    await loadSprintData(activeSprintId);
    await loadAvailableTasks(activeSprintId);
  }

  async function handleRemoveItem(taskId: string) {
    if (!activeSprintId) return;
    await removeTaskFromSprint(activeSprintId, taskId);
    await loadSprintData(activeSprintId);
    await loadAvailableTasks(activeSprintId);
  }

  async function handleMoveItem(taskId: string, newStatus: RoadmapStatus) {
    if (!activeSprintId) return;
    await moveSprintItem(activeSprintId, taskId, newStatus);
    await loadSprintData(activeSprintId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-s text-muted-foreground">
          No sprints yet. Create your first sprint to start planning.
        </p>
        {canEdit && (
          <Button onClick={handleCreateSprint} disabled={isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Create Sprint
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sprint selector */}
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              {sprintData?.name ?? "Select sprint"}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {sprints.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => setActiveSprintId(s.id)}
                className={cn(
                  "flex items-center justify-between gap-4",
                  s.id === activeSprintId && "bg-muted",
                )}
              >
                <span>{s.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs capitalize",
                    s.status === "ACTIVE" && "border-success text-success",
                    s.status === "COMPLETED" && "border-primary text-primary",
                  )}
                >
                  {s.status.toLowerCase()}
                </Badge>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreateSprint}
            disabled={isPending}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New Sprint
          </Button>
        )}
      </div>

      {/* Sprint board */}
      {sprintData ? (
        <SprintBoard
          sprint={sprintData}
          canEdit={canEdit}
          onMoveItem={handleMoveItem}
          onRemoveItem={handleRemoveItem}
          onStartSprint={handleStartSprint}
          onStopSprint={handleStopSprint}
          onAddTasks={handleAddTasks}
          availableTasks={availableTasks}
          loadingTasks={loadingTasks}
        />
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
    </div>
  );
}
