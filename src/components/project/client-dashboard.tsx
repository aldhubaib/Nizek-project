"use client";

import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ListTodo,
} from "lucide-react";

interface TaskSummary {
  TODO: number;
  IN_PROGRESS: number;
  REVIEW: number;
  DONE: number;
  total: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  tasks: TaskSummary;
}

interface Props {
  projects: ProjectSummary[];
}

const STAGE_CONFIG = [
  { key: "TODO" as const, label: "To Do", icon: ListTodo, color: "text-zinc-400" },
  { key: "IN_PROGRESS" as const, label: "In Progress", icon: Clock, color: "text-blue-400" },
  { key: "REVIEW" as const, label: "Review", icon: AlertCircle, color: "text-amber-400" },
  { key: "DONE" as const, label: "Done", icon: CheckCircle2, color: "text-emerald-400" },
];

export function ClientDashboard({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-s">No projects assigned to you yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {projects.map((project) => {
        const completionPercent =
          project.tasks.total > 0
            ? Math.round((project.tasks.DONE / project.tasks.total) * 100)
            : 0;

        return (
          <Card key={project.id} className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-s">{project.name}</CardTitle>
                <Badge
                  variant="outline"
                  className={
                    project.isActive
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/40 bg-red-500/10 text-red-400"
                  }
                >
                  {project.isActive ? "Active" : "Expired"}
                </Badge>
              </div>
              {project.description && (
                <p className="text-s text-muted-foreground">
                  {project.description}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="flex items-center justify-between text-s mb-2">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{completionPercent}%</span>
                </div>
                <Progress value={completionPercent} className="h-2" />
              </div>

              <div className="grid grid-cols-4 gap-3">
                {STAGE_CONFIG.map((stage) => {
                  const Icon = stage.icon;
                  const count = project.tasks[stage.key];
                  return (
                    <div
                      key={stage.key}
                      className="rounded-lg border border-border/40 bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${stage.color}`} />
                        <span className="text-s text-muted-foreground">
                          {stage.label}
                        </span>
                      </div>
                      <p className="mt-1 text-l font-semibold">{count}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
