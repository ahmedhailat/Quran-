import { ArrowRight, BookOpen, CheckCircle2, Flame, Gauge, Headphones, Loader2, RotateCcw, Target } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const surahNames: Record<number, string> = {};

export default function Dashboard() {
  const progressQuery = trpc.quran.progress.useQuery(undefined, { retry: false });
  const surahsQuery = trpc.quran.listSurahs.useQuery();
  const stats = progressQuery.data;

  const getSurahName = (number: number) => surahsQuery.data?.find((surah) => surah.number === number)?.name ?? surahNames[number] ?? `السورة ${number}`;

  if (progressQuery.isLoading) {
    return <div className="dashboard-page loading-state"><Loader2 className="spin" size={24} /> جارٍ تحميل لوحة تقدمك…</div>;
  }

  if (progressQuery.error) {
    return (
      <div className="dashboard-page empty-dashboard">
        <div className="dashboard-empty-icon"><Target size={28} /></div>
        <h1>لوحة تقدمك</h1>
        <p>سجّل الدخول لعرض محاولاتك، متوسط درجاتك، والآيات التي تحتاج إلى مراجعة.</p>
        <Link href="/" className="primary-button"><ArrowRight size={17} /> العودة إلى الجلسة</Link>
      </div>
    );
  }

  const average = stats?.averageScore ?? 0;
  const difficultVerses = stats?.difficultVerses ?? [];
  const activeSurahs = stats?.activeSurahs ?? [];

  return (
    <div className="app-shell dashboard-page-shell">
      <header className="topbar">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark"><BookOpen size={22} /></span>
          <span><strong className="brand-name">سَكِينَة</strong><small className="brand-caption">مساحة لحفظ القرآن</small></span>
        </Link>
        <Link href="/" className="text-action"><ArrowRight size={17} /> العودة إلى جلسة الحفظ</Link>
      </header>

      <main className="dashboard-page">
        <div className="dashboard-heading">
          <div><span className="eyebrow">ملخص رحلتك</span><h1>لوحة تقدّمك في الحفظ</h1><p>نظرة هادئة على ما راجعته، وما يستحق منك تكرارًا إضافيًا.</p></div>
          <div className="dashboard-date"><Flame size={16} /> التقدم يُبنى بالمراجعة اليومية</div>
        </div>

        <section className="stats-grid" aria-label="إحصائيات التقدم">
          <div className="stat-card"><span className="stat-icon"><Headphones size={18} /></span><small>محاولات التلاوة</small><strong>{stats?.totalAttempts ?? 0}</strong><em>تسجيل محفوظ</em></div>
          <div className="stat-card"><span className="stat-icon"><BookOpen size={18} /></span><small>آيات تمت مراجعتها</small><strong>{stats?.reviewedVerses ?? 0}</strong><em>آية فريدة</em></div>
          <div className="stat-card"><span className="stat-icon"><Gauge size={18} /></span><small>متوسط المطابقة</small><strong>{stats?.averageScore === null || stats?.averageScore === undefined ? "—" : `${stats.averageScore}%`}</strong><em>من نتائج Whisper</em></div>
          <div className="stat-card"><span className="stat-icon"><CheckCircle2 size={18} /></span><small>آيات مستقرة</small><strong>{stats?.strongVerses ?? 0}</strong><em>أفضل نتيجة ٨٠٪ أو أكثر</em></div>
        </section>

        <section className="dashboard-grid">
          <div className="dashboard-panel difficult-panel">
            <div className="panel-heading"><div><span className="eyebrow">تحتاج إلى عناية</span><h2>آيات صعبة عليك</h2></div><RotateCcw size={18} /></div>
            {difficultVerses.length === 0 ? (
              <div className="panel-empty"><CheckCircle2 size={24} /><p>لا توجد آيات صعبة مسجلة بعد. ابدأ جلسة تلاوة لتظهر لك المراجعات الذكية.</p></div>
            ) : (
              <div className="difficult-list">{difficultVerses.map((verse) => (
                <div className="difficult-row" key={`${verse.surahNumber}-${verse.ayahNumber}`}>
                  <div className="difficulty-number">{verse.ayahNumber}</div>
                  <div className="difficulty-copy"><strong>{getSurahName(verse.surahNumber)} · الآية {verse.ayahNumber}</strong><span>{verse.missingWords.length ? `راجع: ${verse.missingWords.slice(0, 3).join("، ")}` : "أعد التلاوة مع إبطاء الإيقاع"}</span></div>
                  <div className={`difficulty-score ${verse.averageScore !== null && verse.averageScore < 50 ? "low" : ""}`}>{verse.averageScore === null ? "—" : `${verse.averageScore}%`}</div>
                </div>
              ))}</div>
            )}
          </div>

          <div className="dashboard-panel surahs-panel">
            <div className="panel-heading"><div><span className="eyebrow">خريطة المراجعة</span><h2>السور النشطة</h2></div><BookOpen size={18} /></div>
            {activeSurahs.length === 0 ? <div className="panel-empty"><BookOpen size={24} /><p>ستظهر السور هنا بعد أول محاولة تلاوة محفوظة.</p></div> : <div className="surah-progress-list">{activeSurahs.map((surah) => <div className="surah-progress-row" key={surah.surahNumber}><div><strong>{getSurahName(surah.surahNumber)}</strong><span>{surah.reviewedVerses} آيات · {surah.attempts} محاولات</span></div><div className="surah-bar"><span style={{ width: `${Math.min(surah.averageScore ?? 0, 100)}%` }} /></div><b>{surah.averageScore === null ? "—" : `${surah.averageScore}%`}</b></div>)}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
