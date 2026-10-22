/*
 * دفتر السكينة — جلسة التلاوة
 * Design reminder: a calm editorial learning surface with ink green, ivory paper,
 * olive-gold progress cues, asymmetric study layout, and audio-first interaction.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { shouldAdvanceAfterEvaluation, shouldAdvanceAfterFailure } from "@/lib/recitationFlow";
import { focusSurahPicker } from "@/lib/quranPicker";
import { TajweedReviewCard, type TajweedReview } from "@/components/TajweedReviewCard";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleHelp,
  Headphones,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  BookOpen,
  Square,
  Target,
  Volume2,
  Waves,
  X,
} from "lucide-react";

type ReciterKey = "husary" | "minshawi";
type SessionStep = "listen" | "read" | "review";

type Verse = {
  ayah: number;
  text: string;
  translation: string;
};

type RecognitionResult = {
  transcript: string;
  confidence: number;
};

type AcousticAnalysis = {
  available: boolean;
  durationMs: number | null;
  activeSpeechMs: number | null;
  speechRatio: number | null;
  pauseCount: number | null;
  longestPauseMs: number | null;
  rmsDb: number | null;
  estimatedPitchHz: number | null;
  pitchStability: number | null;
  sustainedVoiceRatio: number | null;
  maddIndicator: string;
  ghunnahIndicator: string;
  findings: string[];
  limitation: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence?: number } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeech = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const RECITERS: Record<ReciterKey, { name: string; shortName: string; folder: string; tradition: string }> = {
  husary: {
    name: "الشيخ محمود خليل الحصري",
    shortName: "الحصري",
    folder: "Husary_64kbps",
    tradition: "مرتل — رواية حفص",
  },
  minshawi: {
    name: "الشيخ محمد صديق المنشاوي",
    shortName: "المنشاوي",
    folder: "Minshawy_Murattal_128kbps",
    tradition: "مرتل — رواية حفص",
  },
};

const AUDIO_BASE = "https://everyayah.com/data";
const normalizeArabic = (value: string) =>
  value
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const compareReading = (spokenText: string, targetText: string) => {
  const spokenWords = normalizeArabic(spokenText).split(" ").filter(Boolean);
  const targetWords = normalizeArabic(targetText).split(" ").filter(Boolean);
  if (spokenWords.length === 0 || targetWords.length === 0) {
    return { score: null as number | null, missingWords: targetWords };
  }
  const matchedWords = targetWords.filter((word) => spokenWords.includes(word));
  const targetBigrams = targetWords.slice(0, -1).map((word, index) => `${word}|${targetWords[index + 1]}`);
  const spokenBigrams = new Set(spokenWords.slice(0, -1).map((word, index) => `${word}|${spokenWords[index + 1]}`));
  const sharedBigrams = targetBigrams.filter((bigram) => spokenBigrams.has(bigram)).length;
  const wordRatio = matchedWords.length / targetWords.length;
  const bigramRatio = targetBigrams.length > 0 ? sharedBigrams / targetBigrams.length : wordRatio;
  const lengthRatio = Math.min(spokenWords.length / targetWords.length, 1);
  const score = Math.max(0, Math.min(100, Math.round((wordRatio * 0.65 + bigramRatio * 0.25 + lengthRatio * 0.1) * 100)));
  return { score, missingWords: targetWords.filter((word) => !spokenWords.includes(word)) };
};

const getSupportedRecordingMimeType = () => {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const makeAudioUrl = (reciter: ReciterKey, surah: number, ayah: number) =>
  `${AUDIO_BASE}/${RECITERS[reciter].folder}/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(new Error("تعذر تجهيز التسجيل للإرسال"));
  reader.readAsDataURL(blob);
});

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-pill">
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}

function StepMarker({ active, complete, label, number }: { active: boolean; complete: boolean; label: string; number: string }) {
  return (
    <div className={`step-marker ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}>
      <span className="step-number">{complete ? <Check size={14} strokeWidth={2.6} /> : number}</span>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const [reciter, setReciter] = useState<ReciterKey>("husary");
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [currentAyah, setCurrentAyah] = useState(1);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionStep, setSessionStep] = useState<SessionStep>("listen");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognized, setRecognized] = useState<RecognitionResult | null>(null);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [tajweedReview, setTajweedReview] = useState<TajweedReview | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AcousticAnalysis | null>(null);
  const [isReciterMenuOpen, setIsReciterMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [notice, setNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const advanceTimerRef = useRef<number | null>(null);
  const recordingBlobRef = useRef<Blob | null>(null);
  const surahsQuery = trpc.quran.listSurahs.useQuery();
  const surahQuery = trpc.quran.getSurah.useQuery({ surahNumber: selectedSurah });
  const createSessionMutation = trpc.quran.createSession.useMutation();
  const analyzeMutation = trpc.quran.analyzeAttempt.useMutation();
  const verses = surahQuery.data?.ayahs ?? [];
  const currentVerse = verses.find((verse) => verse.numberInSurah === currentAyah) ?? { numberInSurah: currentAyah, text: "جاري تحميل الآية…" };
  const currentSurah = surahQuery.data;
  const currentReciter = RECITERS[reciter];
  const progress = currentSurah ? Math.round((currentAyah / currentSurah.numberOfAyahs) * 100) : 0;
  const audioUrl = useMemo(() => makeAudioUrl(reciter, selectedSurah, currentAyah), [reciter, selectedSurah, currentAyah]);

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
    document.title = "سَكِينَة — منصة تحفيظ القرآن";
    return () => {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    };
  }, []);

  useEffect(() => {
    setIsPlaying(false);
    setSessionStep("listen");
    setRecognized(null);
    setFeedback([]);
    setTajweedReview(null);
    setAudioAnalysis(null);
    recordingBlobRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
  }, [audioUrl]);

  useEffect(() => {
    if (!currentSurah || createSessionMutation.isPending) return;
    setSessionId(null);
    createSessionMutation.mutate({ surahNumber: selectedSurah, startAyah: currentAyah, reciter });
  }, [selectedSurah, reciter, currentSurah?.number]);

  useEffect(() => {
    if (createSessionMutation.data?.sessionId) setSessionId(createSessionMutation.data.sessionId);
  }, [createSessionMutation.data?.sessionId]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recognitionRef.current?.stop();
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, [recordingUrl]);

  const handleAudioToggle = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    try {
      await audioRef.current.play();
      setIsPlaying(true);
      setSessionStep("listen");
    } catch {
      setNotice("تعذر تشغيل الصوت من المصدر الخارجي. جرّب الضغط مرة أخرى.");
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setSessionStep("read");
    setNotice("انتهت التلاوة. الآن دورك — اقرأ الآية بهدوء.");
  };

  const startRecording = async () => {
    setNotice("");
    setRecognized(null);
    setFeedback([]);
    setHasRecording(false);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl("");
    }
    chunksRef.current = [];
    transcriptRef.current = "";
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("MICROPHONE_UNAVAILABLE");
      if (typeof MediaRecorder === "undefined") throw new Error("RECORDER_UNAVAILABLE");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setNotice("حدث خطأ أثناء التقاط الصوت. أعد المحاولة وتأكد من صلاحية الميكروفون.");
      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        if (blob.size === 0) {
          setNotice("لم يتم التقاط صوت. تحدث بعد بدء التسجيل ثم اضغط الإيقاف.");
        } else {
          recordingBlobRef.current = blob;
          setRecordingUrl(URL.createObjectURL(blob));
          setHasRecording(true);
          window.setTimeout(() => analyzeReading(true), 120);
        }
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(250);
      setIsRecording(true);
      setSessionStep("read");

      const speechWindow = window as WindowWithSpeech;
      const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        let confidenceTotal = 0;
        let confidenceCount = 0;
        recognition.lang = "ar-SA";
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          let transcript = "";
          for (let index = 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (result.isFinal) {
              transcript += `${result[0].transcript} `;
              if (typeof result[0].confidence === "number" && result[0].confidence > 0) {
                confidenceTotal += result[0].confidence;
                confidenceCount += 1;
              }
            }
          }
          if (transcript.trim()) {
            transcriptRef.current = transcript.trim();
            setRecognized({ transcript: transcriptRef.current, confidence: confidenceCount ? confidenceTotal / confidenceCount : 0 });
          }
        };
        recognition.onerror = () => setNotice("يستمر التسجيل الصوتي، لكن التعرف على الكلمات غير متاح في هذا المتصفح. جرّب Chrome أو أدخل النص الملتقط يدويًا لاحقًا.");
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          setNotice("بدأ تسجيل الصوت، لكن التعرف النصي تعذر تشغيله في هذا المتصفح.");
        }
      } else {
        setNotice("بدأ تسجيل الصوت. هذا المتصفح لا يدعم التعرف النصي العربي، لذلك ستظهر النتيجة كغير متاحة.");
      }
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "NotAllowedError" ? "تم رفض صلاحية الميكروفون. اسمح بها من إعدادات المتصفح ثم أعد المحاولة." : "تعذر بدء التسجيل في هذا المتصفح. تحقق من وجود ميكروفون متصل ثم حاول مرة أخرى.";
      setNotice(reason);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      setNotice("لا يوجد تسجيل نشط لإيقافه.");
      return;
    }
    mediaRecorderRef.current.stop();
    recognitionRef.current?.stop();
    setIsRecording(false);
    setSessionStep("review");
    setNotice("تم حفظ القراءة. جارٍ إرسالها إلى Whisper لتحليلها.");
  };

  const advanceToNextAyah = () => {
    advanceTimerRef.current = null;
    if (currentSurah && currentAyah < currentSurah.numberOfAyahs) {
      setCurrentAyah((ayah) => ayah + 1);
      setSessionStep("listen");
      setRecognized(null);
      setFeedback([]);
      setHasRecording(false);
      recordingBlobRef.current = null;
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      setRecordingUrl("");
      setNotice("انتقلت إلى الآية التالية. استمع أولًا ثم ابدأ قراءتك.");
    } else {
      setSessionStep("review");
      setNotice("أتممت آيات جلسة اليوم. يمكنك إعادة أي آية من القائمة.");
    }
  };

  const scheduleAdvance = (delay = 1400) => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(advanceToNextAyah, delay);
  };

  const analyzeReading = async (shouldAdvance = false) => {
    if (!recordingBlobRef.current || !currentSurah) {
      setNotice("سجّل قراءتك أولًا قبل طلب التحليل.");
      if (shouldAdvance) scheduleAdvance(900);
      return;
    }
    setIsProcessing(true);
    let moveToNext = false;
    try {
      const audioBase64 = await blobToBase64(recordingBlobRef.current);
      const result = await analyzeMutation.mutateAsync({
        sessionId,
        surahNumber: selectedSurah,
        ayahNumber: currentAyah,
        surahAyahCount: currentSurah.numberOfAyahs,
        expectedText: currentVerse.text,
        reciter,
        audioBase64,
        mimeType: recordingBlobRef.current.type || "audio/webm",
        clientTranscript: transcriptRef.current || recognized?.transcript || undefined,
      });
      setRecognized({ transcript: result.transcript, confidence: result.score ? result.score / 100 : 0 });
      setFeedback(result.feedback);
      setTajweedReview(result.tajweedReview ?? null);
      setAudioAnalysis(result.audioAnalysis ?? null);
      moveToNext = shouldAdvanceAfterEvaluation({ shouldAdvance, isComplete: result.isComplete, nextAyah: result.nextAyah });
      setNotice(result.isComplete ? "اكتملت السورة. يمكنك إعادة أي آية من القائمة." : `تم التقييم بدرجة ${result.score ?? "غير متاحة"}%. سيتم الانتقال للآية التالية.`);
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : "تعذر تحليل التسجيل."} سيتم الانتقال للآية التالية ويمكنك مراجعة النتيجة لاحقًا.`);
      moveToNext = shouldAdvanceAfterFailure(shouldAdvance);
    } finally {
      setIsProcessing(false);
      if (moveToNext) scheduleAdvance(1400);
    }
  };

  const resetReading = () => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl("");
    setHasRecording(false);
    setRecognized(null);
    setFeedback([]);
    setAudioAnalysis(null);
    setSessionStep("read");
    setNotice("");
  };

  const selectAyah = (ayah: number) => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl("");
    setHasRecording(false);
    recordingBlobRef.current = null;
    setRecognized(null);
    setFeedback([]);
    setAudioAnalysis(null);
    setCurrentAyah(ayah);
    setSessionStep("listen");
    setNotice("تم اختيار الآية. استمع إلى الشيخ ثم ابدأ قراءتك.");
  };

  const selectSurah = (surahNumber: number) => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setSelectedSurah(surahNumber);
    setCurrentAyah(1);
    setSessionId(null);
    setRecordingUrl("");
    setHasRecording(false);
    recordingBlobRef.current = null;
    setRecognized(null);
    setFeedback([]);
    setAudioAnalysis(null);
    setSessionStep("listen");
    setNotice("جارٍ تجهيز السورة الجديدة.");
  };

  return (
    <div className="app-shell">
      <div className="paper-grain" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><img src="/manus-storage/tahfiz-mark_dc68c333.png" alt="" /></div>
          <div>
            <div className="brand-name">سَكِينَة</div>
            <div className="brand-caption">مساحة لحفظ القرآن</div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="text-action" onClick={() => setShowHelp(true)}><CircleHelp size={17} />كيف تعمل؟</button>
          <Link href="/dashboard" className="profile-button" aria-label="لوحة تقدم الطالب"><span>م</span></Link>
        </div>
      </header>

      <main className="dashboard-layout">
        <aside className="study-sidebar">
          <div className="sidebar-intro">
            <span className="eyebrow">جلسة اليوم</span>
            <h1>وردك الصغير،<br /><em>خطوة ثابتة.</em></h1>
            <p>استمع، اقرأ، ثم راجع موضعك بصوت مطمئن.</p>
          </div>
          <div className="sidebar-divider" />
          <div className="quran-selector" aria-label="اختيار بداية الحفظ">
            <label htmlFor="surah-select">السورة</label>
            <select id="surah-select" value={selectedSurah} onChange={(event) => selectSurah(Number(event.target.value))} disabled={surahsQuery.isLoading}>
              {(surahsQuery.data ?? []).map((surah) => <option key={surah.number} value={surah.number}>{surah.number}. {surah.name}</option>)}
            </select>
            <label htmlFor="ayah-select">ابدأ من الآية</label>
            <select id="ayah-select" value={currentAyah} onChange={(event) => selectAyah(Number(event.target.value))} disabled={surahQuery.isLoading}>
              {Array.from({ length: currentSurah?.numberOfAyahs ?? 0 }, (_, index) => index + 1).map((ayah) => <option key={ayah} value={ayah}>الآية {ayah}</option>)}
            </select>
          </div>
          <div className="progress-block">
            <div className="progress-heading"><span>تقدم الجلسة</span><strong>{progress}%</strong></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="progress-meta"><span>{currentSurah?.name ?? "جاري تحميل السورة"}</span><span>{currentAyah} من {currentSurah?.numberOfAyahs ?? "—"} آيات</span></div>
          </div>
          <nav className="ayah-list" aria-label="آيات الجلسة">
            {verses.map((verse) => (
              <button key={verse.numberInSurah} className={`ayah-list-item ${currentAyah === verse.numberInSurah ? "selected" : ""}`} onClick={() => selectAyah(verse.numberInSurah)}>
                <span className="ayah-index">{String(verse.numberInSurah).padStart(2, "0")}</span>
                <span className="ayah-label">الآية {verse.numberInSurah}</span>
                {currentAyah === verse.numberInSurah ? <span className="ayah-dot" /> : <span className="ayah-check">{verse.numberInSurah < currentAyah ? <Check size={13} /> : ""}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-note"><Sparkles size={16} /><span>الجودة تأتي من التكرار الهادئ، لا من السرعة.</span></div>
        </aside>

        <section className="session-column">
          <div className="session-heading">
            <div>
              <span className="eyebrow">المقطع الحالي · {String(selectedSurah).padStart(3, "0")}</span>
              <h2>{currentSurah?.name ?? "المصحف الشريف"}</h2>
            </div>
            <div className="session-tools">
              <button className="icon-button quran-picker-trigger" onClick={() => focusSurahPicker(document)} aria-label="اختيار السورة والآية" title="اختيار السورة والآية"><BookOpen size={18} /></button>
              <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="مساعدة"><Settings2 size={18} /></button>
              <div className="reciter-select-wrap">
                <button className="reciter-select" onClick={() => setIsReciterMenuOpen(!isReciterMenuOpen)} aria-expanded={isReciterMenuOpen}>
                  <span className="reciter-avatar"><Headphones size={16} /></span>
                  <span><small>صوت الشيخ</small><strong>{currentReciter.shortName}</strong></span>
                  <ChevronDown size={16} className={isReciterMenuOpen ? "rotate" : ""} />
                </button>
                {isReciterMenuOpen && (
                  <div className="reciter-menu">
                    {(Object.keys(RECITERS) as ReciterKey[]).map((key) => (
                      <button key={key} className={key === reciter ? "active" : ""} onClick={() => { setReciter(key); setIsReciterMenuOpen(false); }}>
                        <span>{RECITERS[key].shortName}</span><small>{RECITERS[key].tradition}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="session-steps" aria-label="مراحل الجلسة">
            <StepMarker number="١" label="استمع" active={sessionStep === "listen"} complete={sessionStep !== "listen"} />
            <span className="step-line" />
            <StepMarker number="٢" label="اقرأ" active={sessionStep === "read"} complete={sessionStep === "review"} />
            <span className="step-line" />
            <StepMarker number="٣" label="راجع" active={sessionStep === "review"} complete={false} />
          </div>

          <div className={`verse-card ${sessionStep === "read" ? "reading-state" : ""}`}>
            <div className="verse-spine" aria-label="حالة الجلسة"><span className={sessionStep === "listen" ? "current" : "done"}>استمع</span><span className={sessionStep === "read" ? "current" : sessionStep === "review" ? "done" : ""}>اقرأ</span><span className={sessionStep === "review" ? "current" : ""}>راجع</span></div>
            <div className="verse-card-top"><span className="verse-badge">الآية {currentAyah}</span><span className="verse-reference">{currentSurah?.name ?? "السورة"} · {currentAyah}</span></div>
            <div className="verse-copy"><span className="ornament-line" /><p>{currentVerse.text}</p><span className="ornament-line" /></div>
            <div className="verse-translation">تلاوة الآية برواية حفص عن عاصم</div>
            <div className="verse-actions">
              <button className={`listen-button ${isPlaying ? "playing" : ""}`} onClick={handleAudioToggle}>
                <span className="listen-icon">{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</span>
                <span>{isPlaying ? "إيقاف التلاوة" : "استمع إلى الشيخ"}</span>
              </button>
              <div className="audio-waves" aria-hidden="true">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((bar) => <i key={bar} className={isPlaying ? "active" : ""} style={{ height: `${10 + ((bar * 7) % 19)}px` }} />)}</div>
              <span className="audio-caption">{isPlaying ? "التلاوة جارية" : "استمع ثم ابدأ قراءتك"}</span>
            </div>
            <audio ref={audioRef} src={audioUrl} onEnded={handleAudioEnded} preload="none" />
          </div>

          <div className="reading-panel">
            <div className="reading-panel-header"><div><span className="eyebrow">الخطوة الثانية</span><h3>الآن دورك في القراءة</h3></div><span className={`status-chip ${isRecording ? "recording" : sessionStep === "review" ? "done" : ""}`}>{isRecording ? "جارٍ التسجيل" : sessionStep === "review" ? "تم التسجيل" : "جاهز"}</span></div>
            <p className="reading-instruction">اضغط على الميكروفون، اقرأ الآية بصوتك، ثم اضغط مرة أخرى عندما تنتهي.</p>
            <div className="recording-stage">
              <button className={`record-button ${isRecording ? "active" : ""}`} onClick={isRecording ? stopRecording : startRecording} aria-label={isRecording ? "إيقاف التسجيل" : "بدء التسجيل"}>
                {isRecording ? <Square size={21} fill="currentColor" /> : <Mic size={24} />}
              </button>
              <div className="recording-stage-copy"><strong>{isRecording ? "اقرأ الآن…" : hasRecording ? "تم حفظ القراءة" : "ابدأ من هنا"}</strong><span>{isRecording ? "خذ نفسًا هادئًا وحافظ على إيقاعك" : hasRecording ? "يمكنك الاستماع أو إعادة التسجيل" : "لن نبدأ التسجيل إلا بعد إذنك"}</span></div>
              {hasRecording && recordingUrl && <audio className="mini-audio" src={recordingUrl} controls aria-label="تسجيل الطالب" />}
            </div>
            {notice && <div className="notice" role="status"><Volume2 size={15} />{notice}<button onClick={() => setNotice("")} aria-label="إغلاق التنبيه"><X size={15} /></button></div>}
            <div className="reading-actions"><button className="secondary-button" onClick={resetReading} disabled={!hasRecording && !recognized}><RotateCcw size={16} />إعادة القراءة</button><button className="primary-button" onClick={() => analyzeReading()} disabled={isProcessing || (!hasRecording && !recognized)}>{isProcessing ? "جارٍ التحليل…" : "حلّل قراءتي"}<ArrowLeft size={17} /></button></div>
          </div>

                      {(recognized || feedback.length > 0) && <div className="feedback-panel"><div className="feedback-header"><div><span className="eyebrow">مراجعة تدريبية</span><h3>ملاحظات على قراءتك</h3></div><div className="confidence"><span>وضوح الالتقاط</span><strong>{recognized?.confidence ? `${Math.round(recognized.confidence * 100)}%` : "غير متاح"}</strong></div></div><div className="transcript-box"><span>النص الملتقط</span><p>{recognized?.transcript || "لم يتم التقاط نص واضح بعد."}</p></div>{feedback.length > 0 && <div className="feedback-list">{feedback.map((item, index) => <div key={item} className={`feedback-item ${index === feedback.length - 1 ? "soft" : ""}`}><span>{index === feedback.length - 1 ? <Target size={15} /> : <Check size={15} />}</span><p>{item}</p></div>)}</div>}<p className="feedback-disclaimer">هذه المراجعة آلية ومساندة للتدريب فقط، ولا تغني عن عرض القراءة على شيخ متقن.</p></div>}

          {tajweedReview && <TajweedReviewCard review={tajweedReview} />}

          {audioAnalysis && <div className="audio-analysis-panel" data-testid="audio-analysis-panel"><div className="feedback-header"><div><span className="eyebrow">تحليل صوتي فعلي</span><h3>مؤشرات من تسجيلك</h3></div><span className={`tajweed-confidence ${audioAnalysis.available ? "متوسط" : "منخفض"}`}>{audioAnalysis.available ? "PCM" : "غير متاح"}</span></div>{audioAnalysis.available ? <><div className="audio-metrics"><div><strong>{audioAnalysis.durationMs ? `${(audioAnalysis.durationMs / 1000).toFixed(1)}ث` : "—"}</strong><span>مدة التسجيل</span></div><div><strong>{audioAnalysis.speechRatio !== null ? `${Math.round(audioAnalysis.speechRatio * 100)}%` : "—"}</strong><span>صوت نشط</span></div><div><strong>{audioAnalysis.pauseCount ?? "—"}</strong><span>وقفات واضحة</span></div><div><strong>{audioAnalysis.estimatedPitchHz ? `${audioAnalysis.estimatedPitchHz}Hz` : "—"}</strong><span>متوسط النبرة</span></div></div><div className="audio-indicators"><span>مؤشر امتداد الصوت: <b>{audioAnalysis.maddIndicator}</b></span><span>استقرار الرنين: <b>{audioAnalysis.ghunnahIndicator}</b></span></div>{audioAnalysis.findings.map((finding) => <p className="audio-finding" key={finding}>{finding}</p>)}</> : <p className="audio-finding">{audioAnalysis.findings[0]}</p>}<p className="feedback-disclaimer">{audioAnalysis.limitation}</p></div>}

          <div className="session-footer"><span><Waves size={15} />مصدر الصوت: EveryAyah</span><span>التلاوات متاحة للاستماع العام</span></div>
        </section>

        <aside className="insight-column">
          <div className="insight-art"><img src="/manus-storage/tahfiz-card-art_fd0cb38a.png" alt="أدوات جلسة دراسة هادئة" /><div className="art-label">طقس المراجعة</div></div>
          <div className="insight-copy"><span className="eyebrow">رفقًا بنفسك</span><h3>لا تحفظ الآية<br /><em>دفعة واحدة.</em></h3><p>اسمعها حتى تألف أذنك نبرتها، ثم أعدها بصوتك مرة بعد مرة.</p></div>
          <div className="stats-row"><StatPill value="٠٤" label="آيات اليوم" /><StatPill value="٠٧" label="دقائق تركيز" /><StatPill value="١" label="جلسة مكتملة" /></div>
          <div className="source-card"><div className="source-icon"><Volume2 size={18} /></div><div><strong>تلاوات مختارة</strong><span>{currentReciter.name}</span></div></div>
        </aside>
      </main>

      <footer className="page-footer"><span>سَكِينَة · مساحة هادئة للتعلم</span><span>نسخة تجريبية تعليمية · ٢٠٢٦</span></footer>

      {showHelp && <div className="modal-backdrop" role="presentation" onClick={() => setShowHelp(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)} aria-label="إغلاق"><X size={18} /></button><span className="modal-kicker">ثلاث خطوات بسيطة</span><h2 id="help-title">كيف تعمل الجلسة؟</h2><div className="help-steps"><div><b>١</b><p><strong>استمع</strong><span>اختر صوت الشيخ واستمع للآية كاملة.</span></p></div><div><b>٢</b><p><strong>اقرأ</strong><span>سجّل قراءتك من الميكروفون بإيقاعك.</span></p></div><div><b>٣</b><p><strong>راجع</strong><span>شاهد ملاحظات آلية مساندة ثم أعد المحاولة.</span></p></div></div><button className="primary-button modal-button" onClick={() => setShowHelp(false)}>لنبدأ <ArrowLeft size={17} /></button></div></div>}
    </div>
  );
}
