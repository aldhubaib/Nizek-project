import { beforeEach, describe, expect, it } from "vitest";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";

function task(id: string, title: string): KanbanTask {
  return {
    id,
    taskNumber: 1,
    title,
    description: null,
    priority: null,
    taskType: "BUG",
    stage: "NEW_REQUEST",
    order: 0,
    assignee: null,
    createdBy: { id: "u1", name: "Ada", imageUrl: null },
  };
}

describe("kanban store project scoping", () => {
  beforeEach(() => {
    useKanbanStore.setState({ projectId: null, tasks: [], commentRefreshKey: 0 });
  });

  it("replaces tasks when hydrating a different project", () => {
    useKanbanStore.getState().setTasks([task("a1", "APK Support for HikVision & Matepad")], "project-a");
    useKanbanStore.getState().setTasks([task("b1", "CMS login")], "project-b");

    const state = useKanbanStore.getState();
    expect(state.projectId).toBe("project-b");
    expect(state.tasks.map((t) => t.title)).toEqual(["CMS login"]);
  });

  it("ignores a late functional patch from a previous project", () => {
    useKanbanStore.getState().setTasks([task("a1", "Leftover bug")], "project-a");
    useKanbanStore.getState().setTasks([task("b1", "CMS login")], "project-b");

    useKanbanStore.getState().setTasks((prev) => [...prev, task("a2", "Should not appear")], "project-a");

    const state = useKanbanStore.getState();
    expect(state.projectId).toBe("project-b");
    expect(state.tasks.map((t) => t.title)).toEqual(["CMS login"]);
  });

  it("still merges updates for the current project", () => {
    useKanbanStore.getState().setTasks([task("b1", "CMS login")], "project-b");
    useKanbanStore.getState().setTasks(
      (prev) => prev.map((t) => (t.id === "b1" ? { ...t, title: "CMS login (renamed)" } : t)),
      "project-b",
    );

    expect(useKanbanStore.getState().tasks[0]?.title).toBe("CMS login (renamed)");
  });

  it("does not add a task from another project", () => {
    useKanbanStore.getState().setTasks([task("b1", "CMS login")], "project-b");
    useKanbanStore.getState().addTask(task("a1", "Leftover bug"), "project-a");

    expect(useKanbanStore.getState().tasks.map((t) => t.id)).toEqual(["b1"]);
  });
});
