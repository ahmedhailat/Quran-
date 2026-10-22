import { spawn } from "node:child_process";

export type AcousticAnalysis = {
  available: boolean;
  method: "ffmpeg-pcm" | "unavailable";
  durationMs: number | null;
  activeSpeechMs: number | null;
  speechRatio: number | null;
  pauseCount: number | null;
  longestPauseMs: number | null;
  rmsDb: number | null;
  estimatedPitchHz: number | null;
  pitchStability: number | null;
  sustainedVoiceRatio: number | null;
  maddIndicator: "منخفض" | "متوسط" | "مرتفع" | "غير متاح";
  ghunnahIndicator: "منخفض" | "متوسط" | "مرتفع" | "غير متاح";
  findings: string[];
  limitation: string;
};

const unavailable = (reason = "تعذر تحويل التسجيل إلى عينات صوتية") : AcousticAnalysis => ({
  available: false,
  method: "unavailable",
  durationMs: null,
  activeSpeechMs: null,
  speechRatio: null,
  pauseCount: null,
  longestPauseMs: null,
  rmsDb: null,
  estimatedPitchHz: null,
  pitchStability: null,
  sustainedVoiceRatio: null,
  maddIndicator: "غير متاح",
  ghunnahIndicator: "غير متاح",
  findings: [reason],
  limitation: "المؤشرات الصوتية مساعدة تدريبية ولا تحدد مخرج الحرف أو الحكم التجويدي وحده؛ يلزم شيخ متقن للتأكيد.",
});

function decodeToPcm(audio: Buffer, mimeType: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
      "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    let errorText = "";
    const timeout = setTimeout(() => {
      process.kill("SIGKILL");
      reject(new Error("audio conversion timeout"));
    }, 12_000);
    process.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => { errorText += chunk.toString(); });
    process.on("error", reject);
    process.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(errorText || `ffmpeg exited with ${code}`));
    });
    process.stdin.end(audio);
    void mimeType;
  });
}

function meanSquareDb(samples: number[]): number {
  if (!samples.length) return -Infinity;
  const meanSquare = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
  return 20 * Math.log10(Math.max(Math.sqrt(meanSquare), 1e-6));
}

function estimatePitch(samples: number[], sampleRate: number): number | null {
  if (samples.length < 160) return null;
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if ((samples[index - 1] < 0 && samples[index] >= 0) || (samples[index - 1] >= 0 && samples[index] < 0)) crossings += 1;
  }
  const hz = crossings * sampleRate / (2 * samples.length);
  return hz >= 60 && hz <= 500 ? hz : null;
}

export async function analyzeAudio(audio: Buffer, mimeType = "audio/webm"): Promise<AcousticAnalysis> {
  if (!audio.length) return unavailable("ملف الصوت فارغ");
  try {
    const pcm = await decodeToPcm(audio, mimeType);
    const sampleRate = 16_000;
    const samples = new Array<number>(Math.floor(pcm.length / 2));
    for (let index = 0; index < samples.length; index += 1) samples[index] = pcm.readInt16LE(index * 2) / 32768;
    if (samples.length < sampleRate * 0.08) return unavailable("التسجيل أقصر من أن يعطي مؤشرات صوتية مستقرة");

    const frameSize = 320; // 20 ms at 16 kHz
    const hop = 160; // 10 ms
    const dbFrames: number[] = [];
    const pitches: number[] = [];
    for (let start = 0; start + frameSize <= samples.length; start += hop) {
      const frame = samples.slice(start, start + frameSize);
      const db = meanSquareDb(frame);
      dbFrames.push(db);
      if (db > -42) {
        const pitch = estimatePitch(frame, sampleRate);
        if (pitch) pitches.push(pitch);
      }
    }
    const noiseFloor = Math.min(-35, Math.max(-58, dbFrames.slice().sort((a, b) => a - b)[Math.floor(dbFrames.length * 0.2)] ?? -48));
    const threshold = Math.max(-42, noiseFloor + 8);
    const active = dbFrames.map((db) => db > threshold);
    const activeFrames = active.filter(Boolean).length;
    const speechRatio = active.length ? activeFrames / active.length : 0;
    const durationMs = Math.round(samples.length / sampleRate * 1000);
    const activeSpeechMs = Math.round(activeFrames * 10);
    let pauseCount = 0;
    let longestPauseFrames = 0;
    let currentPause = 0;
    for (const isActive of active) {
      if (isActive) {
        if (currentPause >= 8) pauseCount += 1;
        longestPauseFrames = Math.max(longestPauseFrames, currentPause);
        currentPause = 0;
      } else currentPause += 1;
    }
    longestPauseFrames = Math.max(longestPauseFrames, currentPause);
    if (currentPause >= 8) pauseCount += 1;

    const sustainedFrames = active.reduce((sum, isActive, index) => {
      const next = active[index + 1];
      return sum + (isActive && next ? 1 : 0);
    }, 0);
    const sustainedVoiceRatio = activeFrames ? sustainedFrames / activeFrames : 0;
    const pitchAverage = pitches.length ? pitches.reduce((sum, value) => sum + value, 0) / pitches.length : null;
    const pitchVariance = pitchAverage && pitches.length > 1
      ? pitches.reduce((sum, value) => sum + (value - pitchAverage) ** 2, 0) / pitches.length
      : null;
    const pitchStability = pitchAverage && pitchVariance !== null ? Math.max(0, Math.min(1, 1 - Math.sqrt(pitchVariance) / pitchAverage)) : null;
    const rmsDb = meanSquareDb(samples.slice(0, Math.min(samples.length, sampleRate * 10)));
    const maddIndicator = sustainedVoiceRatio > 0.72 ? "مرتفع" : sustainedVoiceRatio > 0.46 ? "متوسط" : "منخفض";
    const ghunnahIndicator = pitchStability !== null && pitchStability > 0.72 && sustainedVoiceRatio > 0.35 ? "متوسط" : "منخفض";
    const findings = [
      `مدة التسجيل ${durationMs / 1000} ثانية، والصوت النشط قرابة ${Math.round(speechRatio * 100)}%.`,
      pauseCount ? `رُصدت ${pauseCount} وقفة واضحة؛ أطول وقفة ${Math.round(longestPauseFrames * 10 / 10) / 100} ثانية.` : "لم تُرصد وقفات طويلة بين المقاطع.",
      `مؤشر امتداد الصوت/المد على مستوى التسجيل: ${maddIndicator}.`,
      `مؤشر استقرار الرنين الصوتي المرتبط بالغنة: ${ghunnahIndicator}.`,
    ];
    return {
      available: true,
      method: "ffmpeg-pcm",
      durationMs,
      activeSpeechMs,
      speechRatio: Math.round(speechRatio * 100) / 100,
      pauseCount,
      longestPauseMs: longestPauseFrames * 10,
      rmsDb: Math.round(rmsDb * 10) / 10,
      estimatedPitchHz: pitchAverage ? Math.round(pitchAverage) : null,
      pitchStability: pitchStability === null ? null : Math.round(pitchStability * 100) / 100,
      sustainedVoiceRatio: Math.round(sustainedVoiceRatio * 100) / 100,
      maddIndicator,
      ghunnahIndicator,
      findings,
      limitation: "هذه قياسات PCM فعلية من التسجيل (زمن، طاقة، وقفات، واستمرارية/نبرة). لا يمكن نسبها إلى حرف أو تحديد مخرج حرف بدقة دون محاذاة صوتية متخصصة ومراجعة شيخ.",
    };
  } catch (error) {
    console.warn("[AudioAnalysis] unavailable:", error);
    return unavailable("تعذر قراءة صيغة التسجيل الصوتي على الخادم");
  }
}
