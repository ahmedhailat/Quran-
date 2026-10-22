export type WhisperResult = {
  text: string;
  language?: string;
};

export async function transcribeArabicAudio(audio: Buffer, mimeType: string, expectedAyah: string): Promise<WhisperResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (audio.length > 25 * 1024 * 1024) throw new Error("Audio file exceeds the 25MB Whisper limit");

  const form = new FormData();
  const safeMime = mimeType || "audio/webm";
  const extension = safeMime.includes("mp4") || safeMime.includes("m4a") ? "m4a" : safeMime.includes("ogg") ? "ogg" : safeMime.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([new Uint8Array(audio)], { type: safeMime }), `student-reading.${extension}`);
  form.append("model", "whisper-1");
  form.append("language", "ar");
  form.append("response_format", "json");
  form.append("prompt", `تلاوة قرآنية باللغة العربية. الآية المتوقعة هي: ${expectedAyah}`);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Whisper request failed (${response.status})${details ? `: ${details}` : ""}`);
  }
  const payload = (await response.json()) as { text?: string; language?: string };
  if (!payload.text) throw new Error("Whisper returned an empty transcript");
  return { text: payload.text, language: payload.language };
}
