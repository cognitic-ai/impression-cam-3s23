import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const API_KEY = "AIzaSyBdjvTCeXbzCiRpz-4RLam4zCPEvloxDs8";

// All known Gemini models that support image output, tried in order
const IMAGE_MODELS = [
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.5-flash-image",
  "gemini-3-flash-preview",
  "gemini-3-pro-image-preview",
];

function endpointFor(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // strip "data:...;base64," prefix
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
    // Return a data URL directly on web
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

  const body = {
    contents: [
      {
        parts: [
          { text: style.prompt },
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  };

  let lastError = "";

  for (let i = 0; i < IMAGE_MODELS.length; i++) {
    const model = IMAGE_MODELS[i];
    onProgress?.(`Painting with Gemini${i > 0 ? ` (attempt ${i + 1})` : ""}…`);

    const response = await fetch(endpointFor(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      const errJson = JSON.parse(errText).error ?? {};
      lastError = errJson.message ?? errText;

      // 429 quota → try next model after a short pause
      if (response.status === 429) {
        if (i < IMAGE_MODELS.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new Error(
          "All Gemini image models are over quota. Please enable billing at aistudio.google.com or wait and try again."
        );
      }

      // 404 model not found → try next immediately
      if (response.status === 404) continue;

      throw new Error(`Gemini error ${response.status}: ${lastError}`);
    }

    onProgress?.("Rendering painting…");
    const json = await response.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) =>
      p.inline_data?.mime_type?.startsWith("image/")
    );

    if (!imagePart) throw new Error("No image returned by Gemini");
    return saveBase64ToUri(imagePart.inline_data.data);
  }

  throw new Error(`Gemini painting failed: ${lastError}`);
}
