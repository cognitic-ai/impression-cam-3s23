import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { GoogleGenAI } from "@google/genai";

const API_KEY = "AIzaSyBdjvTCeXbzCiRpz-4RLam4zCPEvloxDs8";
const ai = new GoogleGenAI({ apiKey: API_KEY });

// All known models that support image output, tried in order
const IMAGE_MODELS = [
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.5-flash-image",
  "gemini-3-flash-preview",
  "gemini-3-pro-image-preview",
];

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
}

async function saveBase64ToUri(base64: string): Promise<string> {
  if (Platform.OS === "web") {
    return `data:image/png;base64,${base64}`;
  }
  const outputUri = FileSystem.cacheDirectory + `painting_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(outputUri, base64, { encoding: "base64" });
  return outputUri;
}

export type PaintStyle = {
  id: string;
  label: string;
  prompt: string;
  tint: string;
};

export const PAINT_STYLES: PaintStyle[] = [
  {
    id: "monet",
    label: "Monet",
    tint: "rgba(180,210,230,0.3)",
    prompt:
      "Transform this photo into an impressionist oil painting in the style of Claude Monet. Use soft, loose brushstrokes, shimmering light effects, and a dreamy palette of blues, greens, and lavenders. Emphasize atmosphere and light over sharp detail.",
  },
  {
    id: "vangogh",
    label: "Van Gogh",
    tint: "rgba(255,200,80,0.25)",
    prompt:
      "Transform this photo into a post-impressionist painting in the style of Vincent van Gogh. Use bold swirling brushstrokes, vivid contrasting colors, expressive energy, thick impasto texture, and emotional intensity.",
  },
  {
    id: "renoir",
    label: "Renoir",
    tint: "rgba(240,180,150,0.25)",
    prompt:
      "Transform this photo into an impressionist painting in the style of Pierre-Auguste Renoir. Use warm, luminous colors, soft dappled light, loose feathery brushstrokes, and a gentle, joyful atmosphere.",
  },
  {
    id: "seurat",
    label: "Seurat",
    tint: "rgba(200,220,180,0.22)",
    prompt:
      "Transform this photo into a pointillist painting in the style of Georges Seurat. Use thousands of small distinct dots of pure color placed close together, with a scientific approach to color theory and a serene, structured composition.",
  },
  {
    id: "turner",
    label: "Turner",
    tint: "rgba(255,200,100,0.28)",
    prompt:
      "Transform this photo into a Romantic landscape painting in the style of J.M.W. Turner. Use dramatic golden and amber light, atmospheric mist, loose expressive washes of color, and a sense of sublime natural power.",
  },
];

export async function paintWithGemini(
  photoUri: string,
  style: PaintStyle,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.("Reading image…");
  const base64 = await uriToBase64(photoUri);

  const imagePart = { inlineData: { mimeType: "image/jpeg", data: base64 } };
  const textPart = { text: style.prompt };

  let lastError = "";
  let allQuotaExhausted = true;

  for (let i = 0; i < IMAGE_MODELS.length; i++) {
    const model = IMAGE_MODELS[i];
    onProgress?.(`Painting with Gemini${i > 0 ? ` (model ${i + 1}/${IMAGE_MODELS.length})` : ""}…`);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [textPart, imagePart] }],
        config: { responseModalities: ["IMAGE", "TEXT"] },
      });

      const parts = response?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find(
        (p: any) => p.inlineData?.mimeType?.startsWith("image/")
      );

      if (!imgPart?.inlineData?.data) {
        // Model responded but returned no image (e.g. safety block)
        const textContent = parts.find((p: any) => p.text)?.text ?? "";
        throw new Error(`No image in response: ${textContent.slice(0, 100)}`);
      }

      onProgress?.("Rendering painting…");
      return await saveBase64ToUri(imgPart.inlineData.data);

    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      lastError = msg;

      const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
      const isNotFound = msg.includes("404") || msg.includes("not found") || msg.includes("NOT_FOUND");

      if (isQuota) {
        // Try next model after brief pause
        if (i < IMAGE_MODELS.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        // All models quota-exhausted
        throw new Error(
          "Gemini image generation quota exceeded.\n\nThis API key has no free-tier image generation allowance. Please enable billing at aistudio.google.com to use image generation."
        );
      }

      if (isNotFound) {
        // Model doesn't exist for this key, skip silently
        allQuotaExhausted = false;
        continue;
      }

      // Any other error is a real failure
      throw new Error(`Gemini error: ${msg.slice(0, 200)}`);
    }
  }

  throw new Error(`Painting failed: ${lastError}`);
}
