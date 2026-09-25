import type { CaseFile, PersistShape, Role } from "./types";
import {
  STEP_ORDER,
  emptySteps,
  todayISO,
  uid,
} from "./domain";

const STORAGE_KEY = "hxwl-04-rct-records-v1";

export function loadState(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.cases))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: PersistShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败，内存中的看板仍可使用
  }
}

/** 首次使用时植入的示例病历，覆盖逾期、封药、测长中等不同状态 */
export function seedCases(): CaseFile[] {
  const now = (day: string, hh = 10): string =>
    `${day}T${String(hh).padStart(2, "0")}:20:00.000Z`;

  const make = (partial: Partial<CaseFile> & {
    id: string;
    patientName: string;
    tooth: string;
    diagnosis: string;
  }): CaseFile => ({
    canals: [],
    nextVisit: "",
    createdAt: now("2026-09-02"),
    locked: false,
    steps: emptySteps(),
    audit: [],
    ...partial,
  });

  const confirmed = (
    at: string,
    data: Record<string, string> = {}
  ) => ({
    status: "confirmed" as const,
    submittedAt: at,
    submittedBy: "王助理",
    confirmedAt: at,
    confirmedBy: "李医生",
    data,
  });

  // #36 慢性根尖周炎：封药中且复诊已逾期 —— 应排在最前
  const c36 = make({
    id: uid("case-"),
    patientName: "张建国",
    tooth: "36",
    diagnosis: "慢性根尖周炎",
    canals: [
      { id: uid("c-"), name: "MB", length: "19.5", masterFile: "30" },
      { id: uid("c-"), name: "ML", length: "20.0", masterFile: "30" },
      { id: uid("c-"), name: "D", length: "21.0", masterFile: "35" },
    ],
    nextVisit: "2026-09-18",
  });
  c36.steps.access = confirmed(now("2026-09-04"), { 局麻: "碧兰麻 1.7ml", 开髓洞型: "梯形" });
  c36.steps.length = confirmed(now("2026-09-04"), { 测长方式: "电测+拍片确认" });
  c36.steps.prep = confirmed(now("2026-09-11"), { 预备方式: "机用镍钛", 终锉: "F3" });
  c36.steps.irrigate = confirmed(now("2026-09-11"), {
    冲洗液: "次氯酸钠+生理盐水",
    超声荡洗: "3次",
  });
  c36.steps.medicate = confirmed(now("2026-09-11"), { 封药: "氢氧化钙", 暂封: "Caviton" });
  c36.audit = [
    { id: uid("a-"), at: now("2026-09-04"), role: "doctor", actor: "李医生", message: "确认开髓与测长" },
    { id: uid("a-"), at: now("2026-09-11"), role: "doctor", actor: "李医生", message: "确认预备、冲洗，封氢氧化钙，约 2026-09-18 复诊" },
  ];

  // #11 外伤后变色：已充填，病历锁定
  const c11 = make({
    id: uid("case-"),
    patientName: "陈晓雯",
    tooth: "11",
    diagnosis: "外伤后牙髓坏死变色",
    canals: [{ id: uid("c-"), name: "单根管", length: "22.0", masterFile: "40" }],
    nextVisit: "",
    locked: true,
    createdAt: now("2026-08-20"),
  });
  c11.steps.access = confirmed(now("2026-08-20"), { 开髓洞型: "舌侧开髓" });
  c11.steps.length = confirmed(now("2026-08-20"), { 测长方式: "电测 22mm" });
  c11.steps.prep = confirmed(now("2026-08-27"), { 预备方式: "逐步后退", 终锉: "#40" });
  c11.steps.irrigate = confirmed(now("2026-08-27"), { 冲洗液: "次氯酸钠", 超声荡洗: "2次" });
  c11.steps.medicate = confirmed(now("2026-08-27"), { 封药: "氢氧化钙" });
  c11.steps.obturation = confirmed(now("2026-09-03"), {
    充填技术: "冷侧压",
    主牙胶尖: "#40",
    根充糊剂: "AH Plus",
  });
  c11.audit = [
    { id: uid("a-"), at: now("2026-09-03"), role: "doctor", actor: "李医生", message: "确认根充完成，病历锁定" },
  ];

  // #46 急性牙髓炎：测长助理已提交、等待医生确认
  const c46 = make({
    id: uid("case-"),
    patientName: "刘芳",
    tooth: "46",
    diagnosis: "急性牙髓炎",
    canals: [
      { id: uid("c-"), name: "MB", length: "20.5", masterFile: "" },
      { id: uid("c-"), name: "ML", length: "20.0", masterFile: "" },
      { id: uid("c-"), name: "DB", length: "21.5", masterFile: "" },
      { id: uid("c-"), name: "DL", length: "21.0", masterFile: "" },
    ],
    nextVisit: "2026-09-29",
    createdAt: now("2026-09-23"),
  });
  c46.steps.access = confirmed(now("2026-09-23"), { 局麻: "碧兰麻 1.7ml" });
  c46.steps.length = {
    status: "pending",
    submittedAt: now("2026-09-25", 9),
    submittedBy: "王助理",
    data: { 测长方式: "电测，待拍片复核" },
  };
  c46.audit = [
    { id: uid("a-"), at: now("2026-09-25", 9), role: "assistant", actor: "王助理", message: "提交测长记录，等待医生确认" },
  ];

  // #25 开髓完成，尚未测长（演示未测长不能预备）
  const c25 = make({
    id: uid("case-"),
    patientName: "赵磊",
    tooth: "25",
    diagnosis: "慢性牙髓炎",
    canals: [{ id: uid("c-"), name: "单根管", length: "", masterFile: "" }],
    nextVisit: "",
    createdAt: now("2026-09-25", 11),
  });
  c25.steps.access = confirmed(now("2026-09-25", 11), { 开髓洞型: "卵圆形" });
  c25.audit = [
    { id: uid("a-"), at: now("2026-09-25", 11), role: "doctor", actor: "李医生", message: "确认开髓，下次测长" },
  ];

  // #47 封药中，复诊未到期
  const c47 = make({
    id: uid("case-"),
    patientName: "孙美琳",
    tooth: "47",
    diagnosis: "根尖周脓肿（急性期已控制）",
    canals: [
      { id: uid("c-"), name: "近中", length: "19.0", masterFile: "25" },
      { id: uid("c-"), name: "远中", length: "20.5", masterFile: "25" },
    ],
    nextVisit: "2026-10-02",
    createdAt: now("2026-09-16"),
  });
  c47.steps.access = confirmed(now("2026-09-16"), {});
  c47.steps.length = confirmed(now("2026-09-16"), { 测长方式: "电测+拍片" });
  c47.steps.prep = confirmed(now("2026-09-23"), { 预备方式: "机用镍钛" });
  c47.steps.irrigate = confirmed(now("2026-09-23"), { 冲洗液: "次氯酸钠+EDTA" });
  c47.steps.medicate = confirmed(now("2026-09-23"), { 封药: "氢氧化钙" });
  c47.audit = [
    { id: uid("a-"), at: now("2026-09-23"), role: "doctor", actor: "李医生", message: "封药完成，约 2026-10-02 复诊根充" },
  ];

  return [c36, c11, c46, c25, c47];
}

export function createCase(input: {
  patientName: string;
  tooth: string;
  diagnosis: string;
  canals: { name: string }[];
}): CaseFile {
  const ts = new Date().toISOString();
  return {
    id: uid("case-"),
    patientName: input.patientName.trim(),
    tooth: input.tooth.trim(),
    diagnosis: input.diagnosis.trim(),
    canals: input.canals.map((c) => ({
      id: uid("c-"),
      name: c.name.trim(),
      length: "",
      masterFile: "",
    })),
    nextVisit: "",
    createdAt: ts,
    locked: false,
    steps: emptySteps(),
    audit: [
      {
        id: uid("a-"),
        at: ts,
        role: "assistant",
        actor: "王助理",
        message: `建立根管治疗病历（${todayISO()}）`,
      },
    ],
  };
}

export function ensureStepShape(c: CaseFile): CaseFile {
  // 向前兼容：补齐未来可能缺失的步骤键
  const steps = emptySteps();
  for (const s of STEP_ORDER) {
    if (c.steps[s]) steps[s] = c.steps[s];
  }
  return { ...c, steps };
}
