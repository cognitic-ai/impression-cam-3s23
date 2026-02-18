import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { GoogleGenAI } from "@google/genai";

const API_KEY = "AIzaSyBdjvTCeXbzCiRpz-4RLam4zCPEvloxDs8";
const ai = new GoogleGenAI({ apiKey: API_KEY });
const MODEL = "gemini-2.0-flash-exp-image-generation";

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

  onProgress?.("Painting with Gemini…");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: style.prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
        ],
      },
    ],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

  if (!imgPart?.inlineData?.data) {
    const textContent = parts.find((p: any) => p.text)?.text ?? "";
    throw new Error(textContent || "No image returned by Gemini");
  }

  onProgress?.("Rendering painting…");
  return saveBase64ToUri(imgPart.inlineData.data);
}
