import { invokeLLM } from "./_core/llm";

export type TajweedIssue = {
  category: string;
  severity: "ملاحظة" | "مهم" | "يحتاج شيخًا";
  evidence: string;
  correction: string;
};

export type TajweedReview = {
  evaluator: string;
  note: string;
  issues: TajweedIssue[];
  confidence: "منخفض" | "متوسط" | "مرتفع";
};

const fallbackReview = (reason: string): TajweedReview => ({
  evaluator: "مراجع تجويد نصي مساعد",
  note: reason,
  issues: [],
  confidence: "منخفض",
});

const TEXT_ALLOWED_CATEGORIES = ["كلمة ناقصة", "كلمات ناقصة", "كلمة زائدة", "كلمات زائدة", "ترتيب الكلمات", "مطابقة نصية", "النص الملتقط", "خطأ نصي"];
const UNSUPPORTED_EVIDENCE = ["لا يمكن", "لا يكفي", "النص وحده", "لا يمكن إثباته", "غير ممكن"];
const UNSUPPORTED_AUDIO_TERMS = ["المد", "الغنة", "الإدغام", "الإخفاء", "الإقلاب", "مخرج", "مخارج", "صفات الحروف", "الوقف والابتداء", "التفخيم", "الترقيق", "القلقلة", "الهمس", "الجهر", "الاستعلاء", "الاستفال"];

export function sanitizeTajweedReview(review: TajweedReview): TajweedReview {
  const issues = review.issues.filter((issue) => {
    const category = issue.category.toLowerCase();
    const evidence = issue.evidence.trim();
    const isTextCategory = TEXT_ALLOWED_CATEGORIES.some((term) => category.includes(term));
    const isUnsupportedAudioClaim = UNSUPPORTED_AUDIO_TERMS.some((term) => category.includes(term));
    const isUnsupported = UNSUPPORTED_EVIDENCE.some((term) => evidence.includes(term));
    return isTextCategory && !isUnsupportedAudioClaim && evidence.length >= 8 && !isUnsupported;
  });
  const filteredCount = review.issues.length - issues.length;
  const limitation = "أساس المراجعة هو نص Whisper فقط؛ لا يمكن إثبات المدود والغنة والمخارج والأحكام الصوتية من النص وحده، فاعرض القراءة على شيخ متقن.";
  return {
    evaluator: "مراجع تجويد نصي مساعد",
    note: filteredCount > 0 ? `${review.note} ${limitation}` : `${review.note} ${limitation}`,
    issues,
    confidence: issues.length > 0 ? review.confidence : "منخفض",
  };
}

export async function evaluateTajweed(input: { expectedText: string; transcript: string }): Promise<TajweedReview> {
  if (!input.transcript.trim()) return fallbackReview("لم يصل نص عربي واضح؛ لا يمكن إصدار ملاحظة تجويدية موثوقة.");

  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "أنت مراجع تجويد تدريبي عربي. استخدم مبادئ عامة مستلهمة من موضوعات التجويد المشروحة في منهج الدكتور أيمن سويد، مثل مخارج الحروف وصفاتها، المدود، أحكام النون الساكنة والتنوين، أحكام الميم الساكنة، الغنة، والوقف والابتداء. لا تقل إن الدكتور أيمن سويد قيّم القراءة، ولا تدّع اكتشاف خطأ صوتي لا يمكن إثباته من النص. قارن النص المتوقع بالنص الملتقط، وأخرج JSON فقط. إذا لم توجد إشارة كافية، أعد قائمة فارغة واذكر أن التقييم يحتاج شيخًا.",
        },
        {
          role: "user",
          content: `النص المتوقع:\n${input.expectedText}\n\nالنص الملتقط من Whisper:\n${input.transcript}\n\nقدّم ملاحظات قصيرة قابلة للتطبيق، واربط كل ملاحظة بدليل نصي إن أمكن.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tajweed_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              evaluator: { type: "string" },
              note: { type: "string" },
              confidence: { type: "string", enum: ["منخفض", "متوسط", "مرتفع"] },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    severity: { type: "string", enum: ["ملاحظة", "مهم", "يحتاج شيخًا"] },
                    evidence: { type: "string" },
                    correction: { type: "string" },
                  },
                  required: ["category", "severity", "evidence", "correction"],
                  additionalProperties: false,
                },
              },
            },
            required: ["evaluator", "note", "confidence", "issues"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message.content;
    const raw = Array.isArray(content) ? content.map((part) => part.type === "text" ? part.text : "").join(" ") : content;
    if (!raw) return fallbackReview("لم تصل نتيجة تقييم منظمة.");
    return sanitizeTajweedReview(JSON.parse(raw) as TajweedReview);
  } catch (error) {
    console.warn("[Tajweed] Structured review unavailable:", error);
    return fallbackReview("تعذر تشغيل مراجع التجويد الآلي الآن؛ راجع القراءة مع شيخ متقن.");
  }
}
