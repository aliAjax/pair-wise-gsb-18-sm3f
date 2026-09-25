import type {
  CaseFile,
  Role,
  StepId,
  StepRecord,
  StepStatus,
} from "./types";

export const STEP_ORDER: StepId[] = [
  "access",
  "length",
  "prep",
  "irrigate",
  "medicate",
  "obturation",
];

export const STEP_LABEL: Record<StepId, string> = {
  access: "开髓",
  length: "测长",
  prep: "根管预备",
  irrigate: "冲洗",
  medicate: "封药",
  obturation: "充填",
};

export const ROLE_LABEL: Record<Role, string> = {
  assistant: "助理",
  doctor: "医生",
};

export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 演示与显示用的固定"今天"，保证逾期判定可复现 */
export const TODAY = "2026-09-25";

export function emptyStep(data: Record<string, string> = {}): StepRecord {
  return { status: "rejected", data };
}

export function emptySteps(): Record<StepId, StepRecord> {
  return {
    access: emptyStep(),
    length: emptyStep(),
    prep: emptyStep(),
    irrigate: emptyStep(),
    medicate: emptyStep(),
    obturation: emptyStep(),
  };
}

export function stepIndex(step: StepId): number {
  return STEP_ORDER.indexOf(step);
}

/** 当前进行中的步骤：第一个未经医生确认的步骤；全部确认即为充填（已完成） */
export function currentStep(c: CaseFile): StepId {
  for (const s of STEP_ORDER) {
    if (c.steps[s].status !== "confirmed") return s;
  }
  return "obturation";
}

export function stepState(c: CaseFile, step: StepId): StepStatus | "done" {
  const rec = c.steps[step];
  if (rec.status === "confirmed") return "done";
  return rec.status;
}

/** 未录测长（任一根管缺工作长度）则不能进入根管预备 */
export function lengthReady(c: CaseFile): boolean {
  return (
    c.canals.length > 0 &&
    c.canals.every((canal) => canal.length.trim() !== "")
  );
}

export function isOverdue(c: CaseFile): boolean {
  return (
    !c.locked &&
    c.nextVisit.trim() !== "" &&
    c.nextVisit < TODAY
  );
}

export function daysOverdue(c: CaseFile): number {
  if (!c.nextVisit) return 0;
  const ms = new Date(TODAY).getTime() - new Date(c.nextVisit).getTime();
  return Math.round(ms / 86400000);
}

/** 待复诊：未充填且已安排复诊日期（含逾期） */
export function hasVisit(c: CaseFile): boolean {
  return !c.locked && c.nextVisit.trim() !== "";
}

/** 封药：封药步骤已确认且尚未充填 */
export function medicated(c: CaseFile): boolean {
  return !c.locked && c.steps.medicate.status === "confirmed";
}

export type VisitFilter = "all" | "visit" | "medicated" | "length";

export const FILTER_LABEL: Record<VisitFilter, string> = {
  all: "全部",
  visit: "待复诊",
  medicated: "封药",
  length: "工作长度",
};

export function matchFilter(c: CaseFile, filter: VisitFilter): boolean {
  switch (filter) {
    case "visit":
      return hasVisit(c);
    case "medicated":
      return medicated(c);
    case "length":
      return lengthReady(c);
    default:
      return true;
  }
}

/** 逾期病例排最前；其次按复诊日期；未排复诊靠后；已充填沉底 */
export function sortCases(a: CaseFile, b: CaseFile): number {
  if (a.locked !== b.locked) return a.locked ? 1 : -1;
  const ao = isOverdue(a) ? 0 : 1;
  const bo = isOverdue(b) ? 0 : 1;
  if (ao !== bo) return ao - bo;
  if (a.nextVisit && b.nextVisit) {
    return a.nextVisit.localeCompare(b.nextVisit);
  }
  if (a.nextVisit) return -1;
  if (b.nextVisit) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** 助理提交当前步骤前的校验，返回错误信息；null 表示通过 */
export function submitCheck(c: CaseFile, step: StepId): string | null {
  if (c.locked) return "该病历已充填并锁定，不能修改";
  if (currentStep(c) !== step) return "只能提交当前步骤";
  if (c.steps[step].status === "pending")
    return "该步骤已提交，等待医生确认";
  if (step === "prep" && !lengthReady(c)) {
    return "未录工作长度，不能进入根管预备，请先完成测长";
  }
  if (step === "length" && !lengthReady(c)) {
    return "每个根管都必须填写工作长度";
  }
  return null;
}

export function avgWorkingLength(cases: CaseFile[]): string {
  const vals: number[] = [];
  for (const c of cases) {
    for (const canal of c.canals) {
      const n = Number(canal.length);
      if (canal.length.trim() !== "" && !Number.isNaN(n)) vals.push(n);
    }
  }
  if (!vals.length) return "—";
  return (vals.reduce((s, n) => s + n, 0) / vals.length).toFixed(1) + " mm";
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export function stepSummary(c: CaseFile, step: StepId): string {
  const rec = c.steps[step];
  if (rec.status === "rejected" && !rec.confirmedAt && !rec.submittedAt) {
    return "未开始";
  }
  const parts = Object.entries(rec.data)
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `${k}：${v}`);
  if (rec.status === "pending") parts.unshift("待医生确认");
  if (rec.status === "rejected" && rec.rejectReason)
    parts.unshift(`已驳回（${rec.rejectReason}）`);
  return parts.join("；") || "—";
}
