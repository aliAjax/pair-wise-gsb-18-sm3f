import { useEffect, useMemo, useState } from "react";
import "./styles.css";

// ---------------- 类型与常量 ----------------

type StageKey = "access" | "length" | "prep" | "irrigation" | "medication" | "obturation";
type Role = "assistant" | "doctor";
type FilterKey = "all" | "visit" | "medication" | "wl";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "date";
}

interface PendingEntry {
  stage: StageKey;
  values: Record<string, string>;
  by: string;
  at: string;
}

interface HistoryEntry extends PendingEntry {
  confirmedBy: string;
  confirmedAt: string;
}

interface CaseRecord {
  id: string;
  patient: string;
  tooth: string; // FDI 牙位
  diagnosis: string;
  createdAt: string;
  updatedAt: string;
  stageIndex: number;
  workingLength: string; // 测长结果
  maf: string; // 主尖锉号
  nextVisit: string; // 复诊日期 YYYY-MM-DD
  pending: PendingEntry | null; // 助理已录、待医生确认
  history: HistoryEntry[];
  locked: boolean; // 充填完成后锁定，只读
}

const STAGES: { key: StageKey; name: string; hint: string }[] = [
  { key: "access", name: "开髓", hint: "麻醉、露髓、引流" },
  { key: "length", name: "测长", hint: "录入工作长度" },
  { key: "prep", name: "根管预备", hint: "需先完成测长" },
  { key: "irrigation", name: "冲洗", hint: "冲洗液与备注" },
  { key: "medication", name: "封药", hint: "药物与复诊日期" },
  { key: "obturation", name: "充填", hint: "完成后病历锁定" },
];

const STAGE_FIELDS: Record<StageKey, FieldDef[]> = {
  access: [{ key: "note", label: "开髓情况（麻醉 / 露髓 / 出血）" }],
  length: [{ key: "workingLength", label: "工作长度 mm（如 MB19 / DB20 / P21）", required: true }],
  prep: [
    { key: "maf", label: "主尖锉号（如 #35）" },
    { key: "note", label: "预备说明（锥度 / 方法）" },
  ],
  irrigation: [
    { key: "irrigant", label: "冲洗液（如 3% NaClO）" },
    { key: "note", label: "备注" },
  ],
  medication: [
    { key: "medicine", label: "封药药物（如 氢氧化钙）" },
    { key: "nextVisit", label: "复诊日期", type: "date", required: true },
  ],
  obturation: [
    { key: "method", label: "充填方式（热牙胶 / 冷侧压）" },
    { key: "note", label: "备注" },
  ],
};

const FILTERS: { key: FilterKey; name: string }[] = [
  { key: "all", name: "全部" },
  { key: "visit", name: "待复诊" },
  { key: "medication", name: "封药中" },
  { key: "wl", name: "已录工作长度" },
];

const STORAGE_KEY = "hxwl04-endo-records-v1";
const ROLE_KEY = "hxwl04-endo-role-v1";

// ---------------- 工具函数 ----------------

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isOverdue(r: CaseRecord): boolean {
  return !r.locked && r.nextVisit !== "" && r.nextVisit < todayStr();
}

function seedRecords(): CaseRecord[] {
  const now = new Date().toISOString();
  const mk = (partial: Partial<CaseRecord> & Pick<CaseRecord, "patient" | "tooth" | "diagnosis" | "stageIndex">): CaseRecord => ({
    id: uid(),
    createdAt: now,
    updatedAt: now,
    workingLength: "",
    maf: "",
    nextVisit: "",
    pending: null,
    history: [],
    locked: false,
    ...partial,
  });
  return [
    mk({
      patient: "王芳",
      tooth: "36",
      diagnosis: "慢性根尖周炎",
      stageIndex: 4,
      workingLength: "MB19.5 / DB20 / P21",
      maf: "#30",
      nextVisit: daysFromNow(-3), // 逾期未复诊
    }),
    mk({
      patient: "陈杰",
      tooth: "26",
      diagnosis: "急性牙髓炎",
      stageIndex: 2,
      workingLength: "MB18 / DB19 / P20.5",
      nextVisit: daysFromNow(5),
    }),
    mk({
      patient: "赵敏",
      tooth: "46",
      diagnosis: "急性牙髓炎",
      stageIndex: 1,
      pending: {
        stage: "length",
        values: { workingLength: "MB19 / DB19.5 / D20" },
        by: "助理小王",
        at: now,
      },
    }),
    mk({
      patient: "刘洋",
      tooth: "14",
      diagnosis: "深龋露髓",
      stageIndex: 0,
    }),
    mk({
      patient: "李强",
      tooth: "11",
      diagnosis: "外伤后变色",
      stageIndex: 5,
      workingLength: "22",
      maf: "#40",
      locked: true,
      history: [
        {
          stage: "obturation",
          values: { method: "冷侧压", note: "单根管，充填密合" },
          by: "助理小王",
          at: now,
          confirmedBy: "张医生",
          confirmedAt: now,
        },
      ],
    }),
  ];
}

function loadRecords(): CaseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CaseRecord[];
  } catch {
    // 数据损坏时回退到示例数据
  }
  return seedRecords();
}

// ---------------- 弹窗 ----------------

type ModalState = { kind: "new" } | { kind: "entry"; id: string } | { kind: "backfill"; id: string } | null;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------- 主应用 ----------------

function App() {
  const [records, setRecords] = useState<CaseRecord[]>(loadRecords);
  const [role, setRole] = useState<Role>(() => (localStorage.getItem(ROLE_KEY) as Role) || "assistant");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 持久化：任何变更都写回 localStorage，重新打开页面即可恢复
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
  }, [role]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const today = todayStr();

  // ---------------- 业务操作 ----------------

  const addCase = (patient: string, tooth: string, diagnosis: string) => {
    const now = new Date().toISOString();
    setRecords((rs) => [
      ...rs,
      {
        id: uid(),
        patient,
        tooth,
        diagnosis,
        createdAt: now,
        updatedAt: now,
        stageIndex: 0,
        workingLength: "",
        maf: "",
        nextVisit: "",
        pending: null,
        history: [],
        locked: false,
      },
    ]);
    setToast(`已建立 ${patient}（${tooth} 牙位）的治疗档案`);
  };

  // 助理录入当前步骤数据 → 进入“待医生确认”
  const submitEntry = (id: string, values: Record<string, string>, by: string) => {
    setRecords((rs) =>
      rs.map((r) => {
        if (r.id !== id || r.locked) return r;
        const stage = STAGES[r.stageIndex].key;
        if (stage === "prep" && !r.workingLength) {
          setToast("未录测长，不能进入根管预备");
          return r;
        }
        return {
          ...r,
          updatedAt: new Date().toISOString(),
          pending: { stage, values, by, at: new Date().toISOString() },
        };
      })
    );
  };

  // 医生确认 → 当前步骤完成，推进到下一步
  const confirmEntry = (id: string, doctorName: string) => {
    setRecords((rs) =>
      rs.map((r) => {
        if (r.id !== id || !r.pending || r.locked) return r;
        const p = r.pending;
        // 流程门禁：测长必须有工作长度；预备前必须已录测长；封药必须有复诊日期
        if (p.stage === "length" && !p.values.workingLength?.trim()) {
          setToast("未录工作长度，不能确认测长");
          return r;
        }
        if (p.stage === "prep" && !r.workingLength) {
          setToast("未录测长，不能进入根管预备");
          return r;
        }
        if (p.stage === "medication" && !p.values.nextVisit) {
          setToast("未填复诊日期，不能确认封药");
          return r;
        }
        const next: CaseRecord = {
          ...r,
          updatedAt: new Date().toISOString(),
          pending: null,
          history: [...r.history, { ...p, confirmedBy: doctorName, confirmedAt: new Date().toISOString() }],
          stageIndex: Math.min(r.stageIndex + 1, STAGES.length - 1),
        };
        if (p.values.workingLength) next.workingLength = p.values.workingLength;
        if (p.values.maf) next.maf = p.values.maf;
        if (p.values.nextVisit) next.nextVisit = p.values.nextVisit;
        if (p.stage === "obturation") next.locked = true; // 已充填病历保留但不可改
        setToast(`${r.patient}（${r.tooth}）已完成「${STAGES.find((s) => s.key === p.stage)!.name}」`);
        return next;
      })
    );
  };

  // 医生退回助理的录入
  const rejectEntry = (id: string) => {
    setRecords((rs) => rs.map((r) => (r.id === id && !r.locked ? { ...r, pending: null, updatedAt: new Date().toISOString() } : r)));
    setToast("已退回，请助理重新录入");
  };

  // 补录主尖锉号 / 复诊日期（锁定前任意时刻可补）
  const backfill = (id: string, maf: string, nextVisit: string) => {
    setRecords((rs) =>
      rs.map((r) => (r.id === id && !r.locked ? { ...r, maf, nextVisit, updatedAt: new Date().toISOString() } : r))
    );
    setToast("补录已保存");
  };

  const removeCase = (id: string) => {
    const r = records.find((x) => x.id === id);
    if (!r || r.locked) return;
    if (!window.confirm(`确定删除 ${r.patient}（${r.tooth} 牙位）的档案？此操作不可恢复。`)) return;
    setRecords((rs) => rs.filter((x) => x.id !== id));
  };

  // ---------------- 筛选与排序 ----------------

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (filter === "visit" && !(r.nextVisit && !r.locked)) return false;
      if (filter === "medication" && STAGES[r.stageIndex].key !== "medication") return false;
      if (filter === "wl" && !r.workingLength) return false;
      if (q && !`${r.patient}${r.tooth}${r.diagnosis}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, filter, query]);

  const byStage = useMemo(() => {
    const map: CaseRecord[][] = STAGES.map(() => []);
    for (const r of visible) map[r.stageIndex].push(r);
    for (const list of map) {
      list.sort((a, b) => {
        const oa = isOverdue(a) ? 0 : 1;
        const ob = isOverdue(b) ? 0 : 1;
        if (oa !== ob) return oa - ob; // 逾期病例排在前面
        if (a.nextVisit !== b.nextVisit) {
          if (!a.nextVisit) return 1;
          if (!b.nextVisit) return -1;
          return a.nextVisit < b.nextVisit ? -1 : 1;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    }
    return map;
  }, [visible]);

  const stats = useMemo(
    () => ({
      visit: records.filter((r) => r.nextVisit && !r.locked).length,
      overdue: records.filter(isOverdue).length,
      medication: records.filter((r) => !r.locked && STAGES[r.stageIndex].key === "medication").length,
      done: records.filter((r) => r.locked).length,
    }),
    [records]
  );

  // ---------------- 渲染 ----------------

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">牙体牙髓 · 根管治疗长期记录</p>
          <h1>根管治疗看板</h1>
          <p className="subtitle">同一牙位按 开髓 → 测长 → 预备 → 冲洗 → 封药 → 充填 推进；助理录入、医生确认，数据本地保存，重开不丢。</p>
        </div>
        <div className="role-switch">
          <span>当前角色</span>
          <div>
            <button className={role === "assistant" ? "active" : ""} onClick={() => setRole("assistant")}>
              助理
            </button>
            <button className={role === "doctor" ? "active" : ""} onClick={() => setRole("doctor")}>
              医生
            </button>
          </div>
        </div>
      </header>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>待复诊</span>
          <strong>{stats.visit}</strong>
        </article>
        <article className="metric-card danger">
          <span>逾期未复诊</span>
          <strong>{stats.overdue}</strong>
        </article>
        <article className="metric-card">
          <span>封药中</span>
          <strong>{stats.medication}</strong>
        </article>
        <article className="metric-card ok">
          <span>已充填（锁定）</span>
          <strong>{stats.done}</strong>
        </article>
      </section>

      <section className="toolbar">
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
              {f.name}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder="搜索患者 / 牙位 / 诊断…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary-action" onClick={() => setModal({ kind: "new" })}>
          + 新增病例
        </button>
      </section>

      <section className="board">
        {STAGES.map((stage, i) => (
          <div className={`column col-${stage.key}`} key={stage.key}>
            <div className="column-head">
              <div>
                <h2>{stage.name}</h2>
                <p>{stage.hint}</p>
              </div>
              <span className="count">{byStage[i].length}</span>
            </div>
            <div className="column-body">
              {byStage[i].length === 0 && <p className="empty">暂无病例</p>}
              {byStage[i].map((r) => (
                <CaseCard
                  key={r.id}
                  record={r}
                  role={role}
                  today={today}
                  onEntry={() => setModal({ kind: "entry", id: r.id })}
                  onConfirm={() => confirmEntry(r.id, "张医生")}
                  onReject={() => rejectEntry(r.id)}
                  onBackfill={() => setModal({ kind: "backfill", id: r.id })}
                  onDelete={() => removeCase(r.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {modal?.kind === "new" && <NewCaseModal onClose={() => setModal(null)} onSave={addCase} />}
      {modal?.kind === "entry" && (
        <EntryModal
          record={records.find((r) => r.id === modal.id)!}
          onClose={() => setModal(null)}
          onSave={(values, by) => {
            submitEntry(modal.id, values, by);
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "backfill" && (
        <BackfillModal
          record={records.find((r) => r.id === modal.id)!}
          onClose={() => setModal(null)}
          onSave={(maf, nextVisit) => {
            backfill(modal.id, maf, nextVisit);
            setModal(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

// ---------------- 卡片 ----------------

function CaseCard({
  record: r,
  role,
  today,
  onEntry,
  onConfirm,
  onReject,
  onBackfill,
  onDelete,
}: {
  record: CaseRecord;
  role: Role;
  today: string;
  onEntry: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onBackfill: () => void;
  onDelete: () => void;
}) {
  const overdue = isOverdue(r);
  const stageName = STAGES[r.stageIndex].name;

  return (
    <article className={`case-card${overdue ? " overdue" : ""}${r.locked ? " locked" : ""}`}>
      <div className="case-head">
        <div>
          <strong>{r.patient}</strong>
          <span className="tooth">FDI {r.tooth}</span>
        </div>
        {overdue && <span className="badge danger">逾期未复诊</span>}
        {r.locked && <span className="badge locked">已充填 · 只读</span>}
        {!r.locked && r.pending && <span className="badge pending">待医生确认</span>}
      </div>
      <p className="diag">{r.diagnosis}</p>

      <dl className="facts">
        <div>
          <dt>工作长度</dt>
          <dd>{r.workingLength || "—"}</dd>
        </div>
        <div>
          <dt>主尖锉号</dt>
          <dd>{r.maf || "—"}</dd>
        </div>
        <div>
          <dt>复诊日期</dt>
          <dd className={overdue ? "overdue-text" : r.nextVisit === today ? "today-text" : ""}>
            {r.nextVisit || "—"}
            {r.nextVisit === today && !r.locked && "（今日）"}
          </dd>
        </div>
      </dl>

      {r.pending && (
        <div className="pending-box">
          <p>
            助理「{r.pending.by}」已录「{STAGES.find((s) => s.key === r.pending!.stage)!.name}」：
          </p>
          <p className="pending-values">
            {Object.entries(r.pending.values)
              .filter(([, v]) => v)
              .map(([k, v]) => `${STAGE_FIELDS[r.pending!.stage].find((f) => f.key === k)?.label.split("（")[0] ?? k}: ${v}`)
              .join("；") || "（无明细）"}
          </p>
        </div>
      )}

      {!r.locked && (
        <div className="card-actions">
          {(role === "assistant" || role === "doctor") && (
            <button onClick={onEntry}>{r.pending ? "修改录入" : `录入${stageName}`}</button>
          )}
          <button onClick={onBackfill}>补录锉号/复诊</button>
          {role === "doctor" && r.pending && (
            <>
              <button className="confirm" onClick={onConfirm}>
                确认完成
              </button>
              <button className="reject" onClick={onReject}>
                退回
              </button>
            </>
          )}
          {role === "doctor" && (
            <button className="delete" onClick={onDelete}>
              删除
            </button>
          )}
        </div>
      )}
      {r.locked && r.history.length > 0 && (
        <p className="lock-note">
          充填由 {r.history[r.history.length - 1].confirmedBy} 于 {r.history[r.history.length - 1].confirmedAt.slice(0, 10)} 确认，病历保留备查。
        </p>
      )}
    </article>
  );
}

// ---------------- 新增病例 ----------------

function NewCaseModal({ onClose, onSave }: { onClose: () => void; onSave: (p: string, t: string, d: string) => void }) {
  const [patient, setPatient] = useState("");
  const [tooth, setTooth] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const valid = patient.trim() && tooth.trim();

  return (
    <Modal title="新增病例（从开髓开始）" onClose={onClose}>
      <div className="form">
        <label>
          <span>患者姓名 *</span>
          <input value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="如 王芳" />
        </label>
        <label>
          <span>牙位（FDI）*</span>
          <input value={tooth} onChange={(e) => setTooth(e.target.value)} placeholder="如 36、11、46" />
        </label>
        <label>
          <span>诊断</span>
          <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="如 慢性根尖周炎" />
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" disabled={!valid} onClick={() => { onSave(patient.trim(), tooth.trim(), diagnosis.trim()); onClose(); }}>
            建立档案
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- 录入当前步骤 ----------------

function EntryModal({
  record,
  onClose,
  onSave,
}: {
  record: CaseRecord;
  onClose: () => void;
  onSave: (values: Record<string, string>, by: string) => void;
}) {
  const stage = STAGES[record.stageIndex];
  const fields = STAGE_FIELDS[stage.key];
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(record.pending?.values ?? {}) }));
  const [by, setBy] = useState(record.pending?.by ?? "");
  const [error, setError] = useState("");

  const save = () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`「${f.label.split("（")[0]}」为必填项`);
        return;
      }
    }
    if (!by.trim()) {
      setError("请填写录入人");
      return;
    }
    onSave(values, by.trim());
  };

  return (
    <Modal title={`${record.patient}（FDI ${record.tooth}）· 录入「${stage.name}」`} onClose={onClose}>
      <div className="form">
        {stage.key === "prep" && !record.workingLength && (
          <p className="gate-warning">⚠ 该病例尚未录测长，按流程不能进入根管预备。</p>
        )}
        {fields.map((f) => (
          <label key={f.key}>
            <span>
              {f.label}
              {f.required && " *"}
            </span>
            <input
              type={f.type ?? "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </label>
        ))}
        <label>
          <span>录入人 *</span>
          <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="如 助理小王" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <p className="form-hint">提交后进入「待医生确认」，医生确认后本步骤才算完成。</p>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={save}>
            提交待确认
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- 补录主尖锉号 / 复诊日期 ----------------

function BackfillModal({
  record,
  onClose,
  onSave,
}: {
  record: CaseRecord;
  onClose: () => void;
  onSave: (maf: string, nextVisit: string) => void;
}) {
  const [maf, setMaf] = useState(record.maf);
  const [nextVisit, setNextVisit] = useState(record.nextVisit);

  return (
    <Modal title={`${record.patient}（FDI ${record.tooth}）· 补录`} onClose={onClose}>
      <div className="form">
        <label>
          <span>主尖锉号</span>
          <input value={maf} onChange={(e) => setMaf(e.target.value)} placeholder="如 #35" />
        </label>
        <label>
          <span>复诊日期</span>
          <input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} />
        </label>
        <p className="form-hint">补录不改变当前步骤；工作长度只能在「测长」步骤录入。</p>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={() => onSave(maf.trim(), nextVisit)}>
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default App;
