import type { CaseFile } from "../types";
import {
  STEP_LABEL,
  currentStep,
  daysOverdue,
  isOverdue,
  lengthReady,
  medicated,
} from "../domain";

export default function CaseCard({
  c,
  onOpen,
}: {
  c: CaseFile;
  onOpen: (id: string) => void;
}) {
  const cur = currentStep(c);
  const overdue = isOverdue(c);
  const pending = c.steps[cur].status === "pending";

  const canalText = c.canals
    .map((cn) => `${cn.name}${cn.length ? ` ${cn.length}mm` : ""}${cn.masterFile ? `/#${cn.masterFile}` : ""}`)
    .join("　");

  return (
    <article
      className={`case-card ${c.locked ? "locked" : ""} ${overdue ? "overdue" : ""}`}
      onClick={() => onOpen(c.id)}
    >
      <div className="case-top">
        <div className="tooth-badge">#{c.tooth}</div>
        <div className="case-id">
          <strong>{c.patientName}</strong>
          <span>{c.diagnosis}</span>
        </div>
        <div className="case-flags">
          {overdue && <span className="flag flag-danger">逾期 {daysOverdue(c)} 天</span>}
          {medicated(c) && <span className="flag flag-med">封药中</span>}
          {pending && !c.locked && <span className="flag flag-pending">待医生确认</span>}
          {c.locked && <span className="flag flag-done">已充填</span>}
        </div>
      </div>

      <div className="case-progress">
        {(["access", "length", "prep", "irrigate", "medicate", "obturation"] as const).map(
          (s) => {
            const rec = c.steps[s];
            let cls = "p-future";
            if (rec.status === "confirmed") cls = "p-done";
            else if (s === cur) cls = rec.status === "pending" ? "p-pending" : "p-current";
            return (
              <div key={s} className={`prog-step ${cls}`} title={STEP_LABEL[s]}>
                <span className="prog-dot" />
                <small>{STEP_LABEL[s]}</small>
              </div>
            );
          }
        )}
      </div>

      <div className="case-bottom">
        <p className="canal-line">
          {canalText || <span className="muted">尚未登记根管</span>}
          {!lengthReady(c) && !c.locked && (
            <span className="warn-inline">未录齐工作长度</span>
          )}
        </p>
        <p className={`visit-line ${overdue ? "overdue" : ""}`}>
          {c.locked
            ? "病历已锁定，仅供查阅"
            : c.nextVisit
            ? `复诊：${c.nextVisit}${overdue ? "（已逾期）" : ""}`
            : "未安排复诊日期"}
        </p>
      </div>
    </article>
  );
}
