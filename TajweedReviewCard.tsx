import React from "react";
import { Check } from "lucide-react";

type TajweedIssue = {
  category: string;
  severity: string;
  evidence: string;
  correction: string;
};

export type TajweedReview = {
  evaluator: string;
  note: string;
  confidence: "منخفض" | "متوسط" | "مرتفع";
  issues: TajweedIssue[];
};

export function TajweedReviewCard({ review }: { review: TajweedReview }) {
  return (
    <div className="tajweed-review-panel" data-testid="tajweed-review-card">
      <div className="tajweed-review-heading">
        <div>
          <span className="eyebrow">مراجع تجويد تدريبي</span>
          <h3>ملاحظات على النطق والأحكام</h3>
        </div>
        <span className={`tajweed-confidence ${review.confidence}`}>{review.confidence}</span>
      </div>
      <p className="tajweed-review-note">{review.note}</p>
      {review.issues.length > 0 ? (
        <div className="tajweed-issues">
          {review.issues.map((issue, index) => (
            <div className="tajweed-issue" key={`${issue.category}-${index}`}>
              <div className="tajweed-issue-top"><strong>{issue.category}</strong><span>{issue.severity}</span></div>
              <p><b>الإشارة:</b> {issue.evidence}</p>
              <p><b>التصحيح:</b> {issue.correction}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="tajweed-no-issues"><Check size={16} /> لا توجد ملاحظة تجويدية مؤكدة من النص الملتقط.</div>
      )}
      <p className="feedback-disclaimer">هذا تقييم آلي مستلهم من مبادئ التجويد العامة، وليس تقييمًا صادرًا عن الشيخ أيمن سويد، ولا يغني عن مراجعة شيخ متقن.</p>
    </div>
  );
}
