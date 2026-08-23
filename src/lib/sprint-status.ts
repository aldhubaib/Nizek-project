export function isClosedSprint(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIALLY_COMPLETED";
}
