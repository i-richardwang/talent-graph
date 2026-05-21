import { expect, test } from "bun:test";
import { normalizeName } from "./normalize";

test("干净字符串不变", () => {
  expect(normalizeName("清华大学")).toBe("清华大学");
  expect(normalizeName("Harvard University")).toBe("Harvard University");
});

test("trim 首尾 ASCII 空白", () => {
  expect(normalizeName("  清华大学  ")).toBe("清华大学");
  expect(normalizeName("\t清华大学\n")).toBe("清华大学");
  expect(normalizeName("\r\n清华大学\r\n")).toBe("清华大学");
});

test("trim 首尾全角空格 U+3000", () => {
  expect(normalizeName("\u3000清华大学\u3000")).toBe("清华大学");
});

test("trim 首尾 NBSP U+00A0", () => {
  expect(normalizeName("\u00A0清华大学\u00A0")).toBe("清华大学");
});

test("剥离 BOM U+FEFF(首尾 + 内部)", () => {
  expect(normalizeName("\uFEFF清华大学")).toBe("清华大学");
  expect(normalizeName("清华大学\uFEFF")).toBe("清华大学");
  expect(normalizeName("清华\uFEFF大学")).toBe("清华大学");
});

test("剥离零宽字符 U+200B-200D(首尾 + 内部)", () => {
  expect(normalizeName("\u200B清华大学")).toBe("清华大学");
  expect(normalizeName("清华大学\u200C")).toBe("清华大学");
  expect(normalizeName("清华\u200D大学")).toBe("清华大学");
});

test("多种噪音叠加", () => {
  expect(normalizeName("\uFEFF  \u3000清华大学\u00A0  \u200B")).toBe("清华大学");
});

test("内部多空格保留(内部语义不动)", () => {
  expect(normalizeName("Harvard  University")).toBe("Harvard  University");
});

test("大小写保留(语义变体)", () => {
  expect(normalizeName("HARVARD")).toBe("HARVARD");
  expect(normalizeName("harvard")).toBe("harvard");
});

test("繁简保留(语义变体)", () => {
  expect(normalizeName("清華大學")).toBe("清華大學");
});

test("全半角保留(语义变体)", () => {
  expect(normalizeName("ＭＢＢ")).toBe("ＭＢＢ");
  expect(normalizeName("MBB")).toBe("MBB");
});

test("空字符串与纯空白", () => {
  expect(normalizeName("")).toBe("");
  expect(normalizeName("   ")).toBe("");
  expect(normalizeName("\u3000\u200B")).toBe("");
});
