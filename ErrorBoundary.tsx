import React, { type ErrorInfo, type ReactNode } from "react";

export default class ErrorBoundary extends React.Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("واجهة التطبيق تعثرت", error, info); }
  render() {
    if (this.state.failed) return <main className="app-shell empty-dashboard" dir="rtl"><h1>تعذر عرض الصفحة</h1><p>أعد تحميل الصفحة، وإذا استمرت المشكلة فتحقق من تشغيل الخادم.</p></main>;
    return this.props.children;
  }
}
