"use client";

/**
 * Project Board tab — workflow + layout cards.
 * Not the sprint kanban (that is SprintsTab / KanbanBoard / Task.stage).
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ModulePipelinePage } from "@/components/modules/module-pipeline-page";
import {
  getProjectBoard,
  moveBoardRecordToStage,
  type ProjectBoardDTO,
} from "@/actions/board-record";
import { moduleSurface } from "@/lib/modules/registry";

export function BoardTab({ projectId }: { projectId: string }) {
  const [board, setBoard] = useState<ProjectBoardDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    async (flowId?: string | null) => {
      const data = await getProjectBoard(projectId, flowId);
      setBoard(data);
      setLoading(false);
    },
    [projectId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="grid flex-1 place-items-center py-16">
        <p className="text-s text-muted-foreground">
          This board is not available to you.
        </p>
      </div>
    );
  }

  return (
    <ModulePipelinePage
      surface={moduleSurface("board", projectId)}
      flows={board.flows}
      flowId={board.flowId}
      records={board.cards}
      stages={board.stages}
      transitions={board.transitions}
      fields={board.fields}
      users={board.users}
      onMove={(id, stageId, payload) =>
        moveBoardRecordToStage(projectId, id, stageId, payload)
      }
      onFlowChange={(flowId) => {
        setLoading(true);
        void reload(flowId);
      }}
    />
  );
}
