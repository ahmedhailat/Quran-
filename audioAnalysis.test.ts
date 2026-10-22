import { describe, expect, it } from "vitest";
import { analyzeAudio } from "./audioAnalysis";

function makeWav(seconds = 0.5, frequency = 220) {
  const sampleRate = 16_000;
  const sampleCount = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin(2 * Math.PI * frequency * index / sampleRate) * 0.25;
    data.writeInt16LE(Math.round(sample * 32767), index * 2);
  }
  const wav = Buffer.alloc(44 + data.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + data.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);
  return wav;
}

describe("analyzeAudio", () => {
  it("extracts duration, active speech, pauses and pitch from PCM-convertible audio", async () => {
    const result = await analyzeAudio(makeWav(), "audio/wav");
    expect(result.available).toBe(true);
    expect(result.method).toBe("ffmpeg-pcm");
    expect(result.durationMs).toBeGreaterThan(400);
    expect(result.activeSpeechMs).toBeGreaterThan(300);
    expect(result.estimatedPitchHz).toBeGreaterThan(150);
    expect(result.estimatedPitchHz).toBeLessThan(300);
    expect(result.findings.length).toBeGreaterThan(2);
  });

  it("returns a safe unavailable result for invalid input", async () => {
    const result = await analyzeAudio(Buffer.from("not audio"));
    expect(result.available).toBe(false);
    expect(result.maddIndicator).toBe("غير متاح");
    expect(result.limitation).toContain("شيخ");
  });
});
