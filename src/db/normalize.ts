/**
 * 名字归一化:所有参与 UNIQUE / 匹配 / JOIN 的字符串字段在入库前统一归一。
 *
 * 归一化:
 * - 零宽字符全局剥离:ZWSP \u200B / ZWNJ \u200C / ZWJ \u200D / BOM \uFEFF
 * - 首尾空白 trim:覆盖 ASCII 空白 + NBSP \u00A0 + 全角空格 \u3000(JS trim 规范)
 *
 * 不归一化(这些是真实语义变体,靠 entity_aliases 的行穷举覆盖):
 * - 全半角转换、大小写归一、繁简转换、内部多空格归一
 *
 * 跨端契约:下游 JOIN 侧必须对原始字段做等价归一化,两端对称
 * (默认 TRIM 只剥 ASCII 空白,NBSP / 全角空格 / 零宽字符漏剥会静默漏命中)。
 * 具体归一化 SQL 由调用方按其引擎自管,详见 README "字符归一化契约"。
 */
export function normalizeName(s: string): string {
  return s.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}
