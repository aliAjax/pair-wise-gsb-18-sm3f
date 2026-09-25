export type Role = "assistant" | "doctor";

export type StepId =
  | "access"
  | "length"
  | "prep"
  | "irrigate"
  | "medicate"
  | "obturation";

export type StepStatus = "confirmed" | "pending" | "rejected";

export interface Canal {
  id: string;
  name: string;
  /** 工作长度，单位 mm；未测长为空字符串 */
  length: string;
  /** 主尖锉号，例如 30 代表 #30；可后期补录 */
  masterFile: string;
}

export interface StepRecord {
  status: StepStatus;
  /** 助理提交日期 */
  submittedAt?: string;
  submittedBy?: string;
  /** 医生确认/驳回日期 */
  confirmedAt?: string;
  confirmedBy?: string;
  rejectReason?: string;
  /** 步骤结构化数据 */
  data: Record<string, string>;
}

export interface AuditEntry {
  id: string;
  at: string;
  role: Role;
  actor: string;
  message: string;
}

export interface CaseFile {
  id: string;
  patientName: string;
  tooth: string;
  diagnosis: string;
  canals: Canal[];
  /** 下次复诊日期 yyyy-mm-dd，可随时补录/修改 */
  nextVisit: string;
  createdAt: string;
  /** 充填经医生确认后锁定：保留全部记录但禁止修改 */
  locked: boolean;
  steps: Record<StepId, StepRecord>;
  audit: AuditEntry[];
}

export interface PersistShape {
  version: 1;
  cases: CaseFile[];
  role: Role;
  actor: string;
}
