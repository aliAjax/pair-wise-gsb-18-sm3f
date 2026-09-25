import { useState } from "react";

interface Props {
  onClose: () => void;
  onCreate: (input: {
    patientName: string;
    tooth: string;
    diagnosis: string;
    canals: { name: string }[];
  }) => void;
}

const COMMON_CANALS: Record<string, string[]> = {
  "1": ["MB", "DB", "P"],
  "2": ["MB", "DB", "P"],
  "3": ["单根管"],
  "4": ["MB", "ML", "DB", "DL"],
  "5": ["MB", "ML", "DB", "DL"],
  "6": ["MB", "ML", "D"],
  "7": ["近中", "远中"],
  "8": ["近中", "远中"],
};

export default function NewCaseModal({ onClose, onCreate }: Props) {
  const [patientName, setPatientName] = useState("");
  const [tooth, setTooth] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [canals, setCanals] = useState<string[]>([]);
  const [error, setError] = useState("");

  const applyTooth = (value: string) => {
    const v = value.replace(/[#＃\s]/g, "").slice(0, 2);
    setTooth(v);
    if (v.length === 2 && canals.length === 0) {
      setCanals(COMMON_CANALS[v[1]] ?? []);
    }
  };

  const submit = () => {
    if (!patientName.trim()) return setError("请填写患者姓名");
    if (!/^\d{2}$/.test(tooth)) return setError("请填写两位 FDI 牙位（如 36、11）");
    if (!diagnosis.trim()) return setError("请填写诊断");
    if (canals.length === 0) return setError("至少登记一个根管");
    onCreate({
      patientName,
      tooth,
      diagnosis,
      canals: canals.map((name) => ({ name })),
    });
  };

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="detail-head">
          <div>
            <p className="eyebrow">新建根管治疗病历</p>
            <h2>登记牙位与患者</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div className="field-grid">
          <label>
            <span>
              患者姓名<em className="req">*</em>
            </span>
            <input
              value={patientName}
              placeholder="如：张建国"
              onChange={(e) => setPatientName(e.target.value)}
            />
          </label>
          <label>
            <span>
              牙位（FDI）<em className="req">*</em>
            </span>
            <input
              value={tooth}
              inputMode="numeric"
              placeholder="如 36"
              onChange={(e) => applyTooth(e.target.value)}
            />
          </label>
          <label className="wide">
            <span>
              诊断<em className="req">*</em>
            </span>
            <input
              value={diagnosis}
              placeholder="如：慢性根尖周炎"
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          </label>
        </div>

        <div className="canal-edit">
          <span>
            根管<em className="req">*</em>
          </span>
          <div className="chips">
            {canals.map((name, i) => (
              <span key={`${name}-${i}`} className="canal-chip">
                {name}
                <button
                  onClick={() => setCanals((list) => list.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                const name = window.prompt("根管名称", "MB2");
                if (name && name.trim()) setCanals((l) => [...l, name.trim()]);
              }}
            >
              + 添加根管
            </button>
          </div>
          <small className="hint">输入牙位后会按常见解剖预置根管，可增删调整</small>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="step-actions">
          <button className="primary-action" onClick={submit}>
            建立病历
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </section>
    </div>
  );
}
