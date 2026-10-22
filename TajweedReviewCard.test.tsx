import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TajweedReviewCard } from "./TajweedReviewCard";

describe("TajweedReviewCard", () => {
  it("renders the evaluator note and issue content", () => {
    const html = renderToStaticMarkup(<TajweedReviewCard review={{ evaluator: "مراجع تجويد تدريبي", note: "راجع الغنة", confidence: "متوسط", issues: [{ category: "الغنة", severity: "مهم", evidence: "وجود نون مشددة", correction: "أظهر الغنة بوضوح" }] }} />);
    expect(html).toContain("ملاحظات على النطق والأحكام");
    expect(html).toContain("راجع الغنة");
    expect(html).toContain("أظهر الغنة بوضوح");
    expect(html).toContain("tajweed-review-card");
  });
});
