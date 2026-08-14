export function taskTypePrefix(taskType: string): string {
  switch (taskType) {
    case "BUG":
      return "B";
    case "REPORTED_BUG":
      return "RB";
    case "ENHANCEMENT":
      return "E";
    case "DESIGN":
      return "D";
    default:
      return "F";
  }
}

export function taskCode(taskType: string, taskNumber: number): string {
  return `${taskTypePrefix(taskType)}-${String(taskNumber).padStart(3, "0")}`;
}
