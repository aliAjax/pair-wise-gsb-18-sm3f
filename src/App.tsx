import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { CaseFile, Role, StepId, PersistShape } from "./types";
import {
  FILTER_LABEL,
  STEP_LABEL,
  ROLE_LABEL,
  avgWorkingLength,
  hasVisit,
  isOverdue,
  lengthReady,
  matchFilter,
  medicated,
  sortCases,
  submitCheck,
  uid,
  type VisitFilter,
} from "./domain";
import { createCase, ensureStepShape, loadState, saveState, seedCases } from "./storage";
import CaseCard from "./components/CaseCard";
import CaseDetail from "./components/CaseDetail";
import NewCaseModal from "./components/NewCaseModal";

const ACTOR: Record<Role, string> = {
  assistant: "王助理",
  doctor: "李医生",
};

export default function App() {
  const initial = useMemo(() => loadState(), []);
  const [cases, setCases] = useState<CaseFile[]>(
    () => initial?.cases.map(ensureStepShape) ?? seedCases()
  );
  const [role, setRole] = useState<Role>(initial?.role ?? "assistant");
  const [filter, setFilter] = useState<VisitFilter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const state: PersistShape = { version: 1, cases, role, actor: ACTOR[role] };
    saveState(state);
  }, [cases, role]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const actor = ACTOR[role];

  const patchCase = (id: string, fn: (c: CaseFile) => CaseFile) => {
    setCases((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  };

  const addAudit = (c: CaseFile, message: string, who: Role = role): CaseFile => ({
    ...c,
    audit: [
      ...c.audit,
      { id: uid("a-"), at: new Date().toISOString(), role: who, actor: ACTOR[who], message },
    ],
  });

  // ---------- 病例 / 根管编辑 ----------
  const handleCreate = (input: {
    patientName: string;
    tooth: string;
    diagnosis: string;
    canals: { name: string }[];
  }) => {
    const created = createCase(input);
    setCases((list) => [created, ...list]);
    setCreating(false);
    setOpenId(created.id);
    setToast(`已建立 #${input.tooth} 根管治疗病历`);
  };

  const handleAddCanal = (id: string, name: string) =>
    patchCase(id, (c) =>
      addAudit(
        { ...c, canals: [...c.canals, { id: uid("c-"), name, length: "", masterFile: "" }] },
        `补登根管：${name}`
      )
    );

  const handleRemoveCanal = (id: string, canalId: string) =>
    patchCase(id, (c) => {
      const canal = c.canals.find((x) => x.id === canalId);
      const next = { ...c, canals: c.canals.filter((x) => x.id !== canalId) };
      return canal ? addAudit(next, `删除根管：${canal.name}`) : next;
    });

  const handleUpdateCanal = (
    id: string,
    canalId: string,
    patch: { name?: string; length?: string; masterFile?: string }
  ) =>
    patchCase(id, (c) => ({
      ...c,
      canals: c.canals.map((cn) => (cn.id === canalId ? { ...cn, ...patch } : cn)),
    }));

  const handleNextVisit = (id: string, date: string) =>
    patchCase(id, (c) =>
      addAudit({ ...c, nextVisit: date }, date ? `补录/修改复诊日期：${date}` : "清除复诊日期")
    );

  // ---------- 步骤流程：助理提交 → 医生确认 ----------
  const handleStepData = (id: string, step: StepId, key: string, value: string) =>
    patchCase(id, (c) => ({
      ...c,
      steps: {
        ...c.steps,
        [step]: { ...c.steps[step], data: { ...c.steps[step].data, [key]: value } },
      },
    }));

  const handleSubmitStep = (id: string, step: StepId): string | null => {
    const c = cases.find((x) => x.id === id);
    if (!c) return "病历不存在";
    const err = submitCheck(c, step);
    if (err) {
      setToast(err);
      return err;
    }
    if (step === "prep" && !lengthReady(c)) {
      const msg = "未录测长，不能进入根管预备";
      setToast(msg);
      return msg;
    }
    patchCase(id, (prev) =>
      addAudit(
        {
          ...prev,
          steps: {
            ...prev.steps,
            [step]: {
              ...prev.steps[step],
              status: "pending",
              submittedAt: new Date().toISOString(),
              submittedBy: actor,
              rejectReason: undefined,
            },
          },
        },
        `提交「${STEP_LABEL[step]}」记录，等待医生确认`
      )
    );
    return null;
  };

  const handleConfirmStep = (id: string, step: StepId) =>
    patchCase(id, (c) => {
      if (c.locked || c.steps[step].status !== "pending") return c;
      const ts = new Date().toISOString();
      let next: CaseFile = {
        ...c,
        steps: {
          ...c.steps,
          [step]: { ...c.steps[step], status: "confirmed", confirmedAt: ts, confirmedBy: actor },
        },
      };
      next = addAudit(next, `确认完成「${STEP_LABEL[step]}」`, "doctor");
      if (step === "obturation") {
        next = { ...next, locked: true, nextVisit: "" };
        next = addAudit(next, "根充经医生确认，治疗完成，病历锁定不可修改", "doctor");
      }
      return next;
    });

  const handleRejectStep = (id: string, step: StepId, reason: string) =>
    patchCase(id, (c) => {
      if (c.locked || c.steps[step].status !== "pending") return c;
      return addAudit(
        {
          ...c,
          steps: {
            ...c.steps,
            [step]: {
              ...c.steps[step],
              status: "rejected",
              confirmedAt: new Date().toISOString(),
              confirmedBy: actor,
              rejectReason: reason,
            },
          },
        },
        `驳回「${STEP_LABEL[step]}」：${reason}，退回助理修改`,
        "doctor"
      );
    });

  // ---------- 看板派生数据 ----------
  const stats = useMemo(() => {
    const open = cases.filter((c) => !c.locked);
    return {
      visit: open.filter(hasVisit).length,
      overdue: open.filter(isOverdue).length,
      medicated: open.filter(medicated).length,
      filled: cases.filter((c) => c.locked).length,
      avg: avgWorkingLength(cases),
    };
  }, [cases]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases
      .filter((c) => matchFilter(c, filter))
      .filter(
        (c) =>
          !q ||
          c.tooth.includes(q) ||
          c.patientName.toLowerCase().includes(q) ||
          c.diagnosis.toLowerCase().includes(q)
      )
      .sort(sortCases);
  }, [cases, filter, query]);

  const openCase = cases.find((c) => c.id === openId) ?? null;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · 牙体牙髓 · 根管治疗长期记录</p>
          <h1>根管治疗看板</h1>
          <p className="subtitle">
            同一牙位按 开髓 → 测长 → 根管预备 → 冲洗 → 封药 → 充填 推进；助理录入检查数据，医生确认后完成步骤。
            未录工作长度不能进入预备；已充填病历锁定保留、不可修改；逾期复诊自动排前。
          </p>
        </div>
        <div className="role-card">
          <span>当前操作身份</span>
          <div className="role-switch">
            {(["assistant", "doctor"] as Role[]).map((r) => (
              <button
                key={r}
                className={role === r ? "active" : ""}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
                <small>{r === "assistant" ? "录入/提交" : "确认/驳回"}</small>
              </button>
            ))}
          </div>
          <p className="muted">登录人：{actor}</p>
        </div>
      </section>

      <section className="metrics-grid">
        <article className={`metric-card ${stats.overdue > 0 ? "alarm" : ""}`}>
          <span>待复诊（其中逾期）</span>
          <strong>
            {stats.visit}
            <em>/{stats.overdue} 逾期</em>
          </strong>
          <i className="status-danger" />
        </article>
        <article className="metric-card">
          <span>封药病例</span>
          <strong>{stats.medicated}</strong>
          <i className="status-watch" />
        </article>
        <article className="metric-card">
          <span>已充填（锁定）</span>
          <strong>{stats.filled}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>平均工作长度</span>
          <strong className="metric-text">{stats.avg}</strong>
          <i className="status-info" />
        </article>
      </section>

      <section className="board-bar panel">
        <div className="filter-tabs">
          {(Object.keys(FILTER_LABEL) as VisitFilter[]).map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          value={query}
          placeholder="搜索牙位 / 患者 / 诊断（如 36、张建国）"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary-action" onClick={() => setCreating(true)}>
          + 新建病历
        </button>
      </section>

      <section className="case-list">
        {visible.length === 0 && (
          <div className="empty panel">
            没有符合筛选条件的病例。可切换筛选或点击「新建病历」开始记录。
          </div>
        )}
        {visible.map((c) => (
          <CaseCard key={c.id} c={c} onOpen={setOpenId} />
        ))}
      </section>

      <footer className="board-foot">
        所有记录保存在本机浏览器（localStorage），关闭后重新打开可完整恢复；共 {cases.length} 份病历。
      </footer>

      {openCase && (
        <CaseDetail
          caseFile={openCase}
          role={role}
          onClose={() => setOpenId(null)}
          onAddCanal={(name) => handleAddCanal(openCase.id, name)}
          onRemoveCanal={(cid) => handleRemoveCanal(openCase.id, cid)}
          onUpdateCanal={(cid, patch) => handleUpdateCanal(openCase.id, cid, patch)}
          onNextVisit={(d) => handleNextVisit(openCase.id, d)}
          onStepData={(s, k, v) => handleStepData(openCase.id, s, k, v)}
          onSubmitStep={(s) => handleSubmitStep(openCase.id, s)}
          onConfirmStep={(s) => handleConfirmStep(openCase.id, s)}
          onRejectStep={(s, reason) => handleRejectStep(openCase.id, s, reason)}
        />
      )}

      {creating && <NewCaseModal onClose={() => setCreating(false)} onCreate={handleCreate} />}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
