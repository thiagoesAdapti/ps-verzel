export function log(
  level: "info" | "warn" | "error",
  event: string,
  context: Record<string, unknown> = {}
) {
  const entry = { timestamp: new Date().toISOString(), level, event, ...context };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}
