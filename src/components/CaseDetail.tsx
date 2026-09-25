import { useState } from "react";
import type { CaseFile, Role, StepId } from "../types";
import {
  STEP_LABEL,
  STEP_ORDER,
  currentStep,
  formatDateTime,
  isOverdue,
  lengthReady,
  daysOverdue,
  submitCheck,
} from "../domain";
import { STEP_FIELDS, type FieldDef } from "../stepConfig";

interface Props {
  caseFile: CaseFile;
  role: Role;
  onClose: () => void;
  onAddCanal: (name: string) => void;
  onRemoveCanal: (id: string) => void;
  onUpdateCanal: (id: string, patch: { name?: string; length?: string; masterFile?: string }) => void;
  onNextVisit: (date: string) => void;
  onStepData: (step: StepId, key: string, value: string) => void;
  onSubmitStep: (step: StepId) => string | null;
  onConfirmStep: (step: StepId) => void;
  onRejectStep: (step: StepId, reason: string) => void;
}

const STATUS_TEXT: Record<string, string> = {
  done: "已完成",
  pending: "待医生确认",
  rejected: "未提交",
};

function Stepper({ c }: { c: CaseFile }) {
  const cur = currentStep(c);
  return (
    <ol className="stepper">
      {STEP_ORDER.map((s) => {
        const rec = c.steps[s];
        let cls = "future";
        if (rec.status === "confirmed") cls = "done";
        else if (s === cur) {
          cls = rec.status === "pending" ? "current pending" : "current";
        }
        return (
          <li key={s} className={`step ${cls}`}>
            <span className="step-dot" />
            <span className="step-name">{STEP_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  def,
  value,
  disabled,
  onChange,
}: {
  def: FieldDef;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const common = {
    value,
    disabled,
    placeholder: def.placeholder ?? (def.options ? "请选择" : `填写${def.label}`),
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => onChange(e.target.value),
  };
  return (
    <label className={def.multiline ? "wide" : ""}>
      <span>
        {def.label}
        {def.required ? <em className="req">*</em> : null}
      </span>
      {def.multiline ? (
        <textarea rows={2} {...common} />
      ) : def.options ? (
        <select {...common}>
          <option value="">请选择</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} />
      )}
    </label>
  );
}

function StepCard({
  c,
  step,
  role,
  onStepData,
  onSubmitStep,
  onConfirmStep,
  onRejectStep,
}: Pick<
  Props,
  "onStepData" | "onSubmitStep" | "onConfirmStep" | "onRejectStep"
> & {
  c: CaseFile;
  step: StepId;
  role: Role;
}) {
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const rec = c.steps[step];
  const cur = currentStep(c);
  const isCurrent = !c.locked && cur === step;
  const locked = c.locked;
  const fields = STEP_FIELDS[step];

  // 仅当前步骤、且角色为助理、且未在待确认状态时可录入
  const formDisabled =
    locked || !isCurrent || role !== "assistant" || rec.status === "pending";

  const headerCls = `step-card-head ${rec.status === "confirmed" ? "ok" : ""} ${
    isCurrent ? "current" : ""
  }`;

  const submit = () => {
    const missing = fields.find(
      (f) => f.required && (rec.data[f.key] ?? "").trim() === ""
    );
    if (missing) {
      setError(`请先填写必填项：${missing.label}`);
      return;
    }
    const err = onSubmitStep(step);
    setError(err);
  };

  const reject = () => {
    if (reason.trim() === "") {
      setError("请填写驳回原因");
      return;
    }
    onRejectStep(step, reason.trim());
    setReason("");
    setRejectOpen(false);
    setError(null);
  };

  return (
    <article className={`step-card ${rec.status} ${isCurrent ? "is-current" : ""}`}>
      <div className={headerCls}>
        <div>
          <h4>
            {STEP_LABEL[step]}
            {step === "prep" && !lengthReady(c) && !locked && (
              <span className="lock-hint" title="未录测长不能进入根管预备">
                🔒 需先完成测长
              </span>
            )}
          </h4>
          <p>
            {rec.status === "confirmed"
              ? `医生 ${rec.confirmedBy ?? ""} 于 ${formatDateTime(rec.confirmedAt ?? "")} 确认`
              : rec.status === "pending"
              ? `助理 ${rec.submittedBy ?? ""} 于 ${formatDateTime(rec.submittedAt ?? "")} 提交，待医生确认`
              : rec.rejectReason
              ? `被驳回：${rec.rejectReason}（${formatDateTime(rec.confirmedAt ?? "")}）`
              : isCurrent
              ? STATUS_TEXT.rejected
              : locked
              ? "治疗已完成，该步骤无补充记录"
              : "前置步骤未完成"}
          </p>
        </div>
        <span className={`step-badge ${rec.status}`}>
          {rec.status === "confirmed"
            ? "✓ 已完成"
            : rec.status === "pending"
            ? "待确认"
            : isCurrent
            ? "进行中"
            : locked
            ? "无记录"
            : "未开始"}
        </span>
      </div>

      <div className="step-body">
        <div className="field-grid">
          {fields.map((f) => (
            <Field
              key={f.key}
              def={f}
              value={rec.data[f.key] ?? ""}
              disabled={formDisabled}
              onChange={(v) => onStepData(step, f.key, v)}
            />
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}

        {isCurrent && rec.status === "rejected" && role === "assistant" && (
          <div className="step-actions">
            <button className="primary-action" onClick={submit}>
              提交医生确认
            </button>
          </div>
        )}
        {isCurrent && rec.status === "pending" && role === "assistant" && (
          <p className="waiting-tip">已提交，等待医生确认后完成本步骤</p>
        )}
        {isCurrent && rec.status === "pending" && role === "doctor" && (
          <div className="step-actions">
            <button
              className="primary-action"
              onClick={() => {
                setError(null);
                onConfirmStep(step);
              }}
            >
              确认完成
            </button>
            <button onClick={() => setRejectOpen((v) => !v)}>驳回修改</button>
            {rejectOpen && (
              <span className="reject-inline">
                <input
                  autoFocus
                  value={reason}
                  placeholder="驳回原因（如：长度复核不符）"
                  onChange={(e) => setReason(e.target.value)}
                />
                <button onClick={reject}>确认驳回</button>
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function CaseDetail(props: Props) {
  const {
    caseFile: c,
    role,
    onClose,
    onAddCanal,
    onRemoveCanal,
    onUpdateCanal,
    onNextVisit,
  } = props;
  const [newCanal, setNewCanal] = useState("");
  const cur = currentStep(c);
  const lengthConfirmed = c.steps.length.status === "confirmed";
  const overdue = isOverdue(c);

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <section className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <header className="detail-head">
          <div>
            <p className="eyebrow">牙体牙髓 · 根管治疗长期记录</p>
            <h2>
              #{c.tooth} <span className="patient-name">{c.patientName}</span>
              {c.locked && <span className="locked-badge">已充填 · 病历锁定</span>}
            </h2>
            <p className="diagnosis">诊断：{c.diagnosis || "—"}</p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        {c.locked && (
          <div className="lock-banner">
            该病历已充填并经医生确认，记录完整保留供复诊查阅，任何内容不可修改。
          </div>
        )}

        <Stepper c={c} />

        <div className="detail-grid">
          <div className="detail-main">
            <section className="inner-panel">
              <div className="inner-head">
                <h3>根管与工作长度</h3>
                <span className="hint">工作长度在测长确认前可改；主尖锉号（#）可随时补录</span>
              </div>
              <table className="canal-table">
                <thead>
                  <tr>
                    <th>根管</th>
                    <th style={{ width: 160 }}>工作长度 (mm)</th>
                    <th style={{ width: 160 }}>主尖锉号 (#)</th>
                    <th style={{ width: 64 }} />
                  </tr>
                </thead>
                <tbody>
                  {c.canals.map((canal) => {
                    const lengthDisabled = c.locked || lengthConfirmed;
                    const fileDisabled = c.locked;
                    return (
                      <tr key={canal.id}>
                        <td>
                          <input
                            value={canal.name}
                            disabled={c.locked || lengthConfirmed}
                            onChange={(e) =>
                              onUpdateCanal(canal.id, { name: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={canal.length}
                            inputMode="decimal"
                            placeholder="如 19.5"
                            disabled={lengthDisabled}
                            onChange={(e) =>
                              onUpdateCanal(canal.id, { length: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={canal.masterFile}
                            inputMode="numeric"
                            placeholder={fileDisabled ? "" : "补录，如 30"}
                            disabled={fileDisabled}
                            onChange={(e) =>
                              onUpdateCanal(canal.id, { masterFile: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          {!c.locked && !lengthConfirmed && (
                            <button
                              className="mini-danger"
                              onClick={() => onRemoveCanal(canal.id)}
                            >
                              删
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!c.locked && !lengthConfirmed && (
                <div className="add-canal">
                  <input
                    value={newCanal}
                    placeholder="新增根管名称（如 MB2）"
                    onChange={(e) => setNewCanal(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (newCanal.trim()) {
                        onAddCanal(newCanal.trim());
                        setNewCanal("");
                      }
                    }}
                  >
                    添加根管
                  </button>
                </div>
              )}
            </section>

            {STEP_ORDER.map((s) => (
              <StepCard key={s} c={c} step={s} role={role}
                onStepData={props.onStepData}
                onSubmitStep={props.onSubmitStep}
                onConfirmStep={props.onConfirmStep}
                onRejectStep={props.onRejectStep}
              />
            ))}
          </div>

          <aside className="detail-side">
            <section className="inner-panel">
              <h3>复诊计划</h3>
              {c.locked ? (
                <p className="muted">已充填，无需复诊安排</p>
              ) : (
                <>
                  <label>
                    <span>下次复诊日期</span>
                    <input
                      type="date"
                      value={c.nextVisit}
                      onChange={(e) => onNextVisit(e.target.value)}
                    />
                  </label>
                  {c.nextVisit && (
                    <p className={overdue ? "visit-overdue" : "visit-ok"}>
                      {overdue
                        ? `已逾期 ${daysOverdue(c)} 天，看板自动置顶`
                        : "复诊安排有效"}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="inner-panel">
              <h3>当前进度</h3>
              <p className="muted">
                {c.locked
                  ? "根管治疗已完成（充填）"
                  : `进行中：${STEP_LABEL[cur]}${
                      c.steps[cur].status === "pending" ? "（助理已提交，待医生确认）" : ""
                    }`}
              </p>
            </section>

            <section className="inner-panel">
              <h3>操作记录</h3>
              <ul className="audit-list">
                {[...c.audit].reverse().map((a) => (
                  <li key={a.id}>
                    <span className={`audit-role ${a.role}`}>
                      {a.role === "doctor" ? "医生" : "助理"}
                    </span>
                    <div>
                      <p>{a.message}</p>
                      <small>
                        {a.actor} · {formatDateTime(a.at)}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
