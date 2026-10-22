import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateTajweed, sanitizeTajweedReview } from "./tajweed";

const mocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));

describe("evaluateTajweed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns structured training notes from the evaluator", async () => {
    mocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ evaluator: "مراجع تجويد تدريبي", note: "راجع الغنة", confidence: "متوسط", issues: [{ category: "كلمة ناقصة", severity: "مهم", evidence: "الكلمة موجودة في النص المتوقع وليست في الملتقط", correction: "أعد الكلمة ثم اعرض القراءة على شيخ" }] }) } }] });
    const result = await evaluateTajweed({ expectedText: "إِنَّا أَعْطَيْنَاكَ", transcript: "انا اعطيناك" });
    expect(result.issues[0]?.category).toBe("كلمة ناقصة");
    expect(result.confidence).toBe("متوسط");
  });

  it("filters audio-only claims that cannot be proven from a transcript", () => {
    const result = sanitizeTajweedReview({ evaluator: "x", note: "مراجعة", confidence: "مرتفع", issues: [{ category: "الغنة", severity: "مهم", evidence: "النص وحده لا يمكن إثباته", correction: "راجع شيخًا" }, { category: "زمن صوتي غير مضبوط", severity: "مهم", evidence: "وصف صوتي غير قابل للاستخراج من النص", correction: "راجع شيخًا" }, { category: "كلمة ناقصة", severity: "ملاحظة", evidence: "الكلمة موجودة في النص المتوقع وليست في الملتقط", correction: "أعد الكلمة" }] });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.category).toBe("كلمة ناقصة");
    expect(result.confidence).toBe("مرتفع");
    expect(result.note).toContain("لا يمكن إثبات");
  });

  it("returns a safe fallback when no transcript is available", async () => {
    const result = await evaluateTajweed({ expectedText: "الحمد لله", transcript: "" });
    expect(result.confidence).toBe("منخفض");
    expect(result.issues).toEqual([]);
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });
});
