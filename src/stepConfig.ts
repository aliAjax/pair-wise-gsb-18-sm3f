import type { StepId } from "./types";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** textarea */
  multiline?: boolean;
}

export const STEP_FIELDS: Record<StepId, FieldDef[]> = {
  access: [
    { key: "麻醉", label: "麻醉方式", placeholder: "如：碧兰麻 1.7ml 局部浸润" },
    {
      key: "开髓洞型",
      label: "开髓洞型",
      required: true,
      options: ["卵圆形", "梯形", "三角形", "其他"],
    },
    {
      key: "橡皮障",
      label: "橡皮障隔离",
      required: true,
      options: ["是", "否"],
    },
    { key: "备注", label: "备注", multiline: true, placeholder: "髓室顶去除、穿髓孔等情况" },
  ],
  length: [
    {
      key: "测长方式",
      label: "测长方式",
      required: true,
      options: ["电测", "X线片", "电测+拍片确认"],
    },
    { key: "参考点", label: "参考点", placeholder: "如：近中颊尖、切端" },
    { key: "备注", label: "备注", multiline: true, placeholder: "各根管长度见下方根管表" },
  ],
  prep: [
    {
      key: "预备方式",
      label: "预备方式",
      required: true,
      options: ["标准法", "逐步后退", "机用镍钛", "冠向下"],
    },
    { key: "初尖锉", label: "初尖锉", placeholder: "如：#15" },
    { key: "终锉", label: "终锉 / 主尖锉", required: true, placeholder: "如：#30 / F3" },
    { key: "备注", label: "备注", multiline: true },
  ],
  irrigate: [
    {
      key: "冲洗液",
      label: "冲洗液",
      required: true,
      placeholder: "如：2.5%次氯酸钠+生理盐水",
    },
    { key: "冲洗量", label: "冲洗量 (ml)", placeholder: "如：20" },
    { key: "超声荡洗", label: "超声荡洗", options: ["未做", "1次", "2次", "3次"] },
    { key: "备注", label: "备注", multiline: true },
  ],
  medicate: [
    {
      key: "封药",
      label: "封药材料",
      required: true,
      options: ["氢氧化钙", "CP 樟脑酚", "FC 甲醛甲酚", "其他"],
    },
    {
      key: "暂封",
      label: "暂封材料",
      options: ["Caviton", "氧化锌丁香酚", "玻璃离子", "其他"],
    },
    { key: "备注", label: "备注", multiline: true },
  ],
  obturation: [
    {
      key: "充填技术",
      label: "充填技术",
      required: true,
      options: ["冷侧压", "热牙胶垂直加压", "单尖法", "其他"],
    },
    { key: "主牙胶尖", label: "主牙胶尖", required: true, placeholder: "如：#40" },
    { key: "根充糊剂", label: "根充糊剂", options: ["AH Plus", "iRoot SP", "氧化锌丁香酚", "其他"] },
    {
      key: "拍片结果",
      label: "根充片结果",
      options: ["恰填", "欠填", "超填"],
    },
    { key: "备注", label: "备注", multiline: true },
  ],
};
