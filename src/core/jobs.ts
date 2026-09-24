import { makeId } from "./ids";
import type { ExecutionEnv, Job, JobStatus } from "./types";
import { workspaceStore } from "./store";
import { Semaphore } from "./semaphore";

export { Semaphore } from "./semaphore";

const MAX_LOGS = 200;

export function createJob(init: {
  title: string;
  actionId?: string;
  inputIds?: string[];
  execution?: ExecutionEnv;
}): Job {
  const job: Job = {
    id: makeId("jb"),
    title: init.title,
    actionId: init.actionId,
    inputIds: init.inputIds ?? [],
    outputIds: [],
    status: "queued",
    progress: null,
    logs: [{ at: Date.now(), level: "info", text: "Đang chờ" }],
    execution: init.execution ?? "local",
  };
  workspaceStore.setState((s) => ({ jobs: { ...s.jobs, [job.id]: job } }));
  return job;
}

export function patchJob(id: string, patch: Partial<Job>) {
  workspaceStore.setState((s) => {
    const prev = s.jobs[id];
    if (!prev) return s;
    return { jobs: { ...s.jobs, [id]: { ...prev, ...patch } } };
  });
}

export function logJob(id: string, level: "info" | "warn" | "error", text: string) {
  workspaceStore.setState((s) => {
    const prev = s.jobs[id];
    if (!prev) return s;
    const logs = [...prev.logs, { at: Date.now(), level, text }].slice(-MAX_LOGS);
    return { jobs: { ...s.jobs, [id]: { ...prev, logs, message: text } } };
  });
}

export function setJobStatus(id: string, status: JobStatus, extra?: Partial<Job>) {
  const now = Date.now();
  patchJob(id, {
    status,
    ...(status === "running" ? { startedAt: now } : {}),
    ...(status === "success" || status === "failed" || status === "cancelled" || status === "warning"
      ? { finishedAt: now }
      : {}),
    ...extra,
  });
}

export const parseSemaphore = new Semaphore(3);
export const actionSemaphore = new Semaphore(4);
