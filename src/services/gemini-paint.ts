import * as FileSystem from "expo-file-system/legacy";

const API_KEY = "AIzaSyBdjvTCeXbzCiRpz-4RLam4zCPEvloxDs8";
const MODEL = "gemini-2.0-flash-preview-image-generation";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

  // Read the photo as base64
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: "base64",
  });

  onProgress?.("Sending to Gemini…");

  const body = {
    contents: [
      {
        parts: [
          { text: style.prompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  onProgress?.("Rendering painting…");

  const json = await response.json();

  // Extract image from response
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(
    (p: any) => p.inline_data?.mime_type?.startsWith("image/")
  );

  if (!imagePart) {
    throw new Error("No image returned by Gemini");
  }

  // Save to a temp file and return its URI
  const outputUri =
    FileSystem.cacheDirectory + `painting_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(outputUri, imagePart.inline_data.data, {
    encoding: "base64",
  });

  return outputUri;
}
