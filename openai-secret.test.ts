import { describe, expect, it } from "vitest";

describe("OpenAI API secret", () => {
  it("can authenticate against the lightweight models endpoint", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    expect(apiKey, "OPENAI_API_KEY must be configured").toBeTruthy();

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok, `OpenAI authentication failed with HTTP ${response.status}`).toBe(true);
  }, 20_000);
});
