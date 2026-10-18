import type { Logger } from "../../application/ports/Logger.js";

const line = (level: string, message: string, data?: Record<string, unknown>) =>
  JSON.stringify({ time: new Date().toISOString(), level, message, ...data });

/** JSON lines: info on stdout, errors on stderr. Easy to grep or ship to a log collector. */
export function makeConsoleLogger(): Logger {
  return {
    info: (message, data) => console.log(line("info", message, data)),
    error: (message, data) => console.error(line("error", message, data)),
  };
}
