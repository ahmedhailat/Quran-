import { Link } from "wouter";

export default function NotFound() {
  return <main className="app-shell empty-dashboard" dir="rtl">
    <h1>الصفحة غير موجودة</h1>
    <p>عذراً، لم نعثر على الصفحة المطلوبة.</p>
    <Link href="/" className="primary-button">العودة إلى الصفحة الرئيسية</Link>
  </main>;
}
