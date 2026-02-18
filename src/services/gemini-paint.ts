import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { GoogleGenAI } from "@google/genai";

const API_KEY = "AIzaSyBdjvTCeXbzCiRpz-4RLam4zCPEvloxDs8";
const ai = new GoogleGenAI({ apiKey: API_KEY });
const MODEL = "gemini-3-pro-image-preview";

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

const BASE_REQUIREMENTS = `
TECHNICAL REQUIREMENTS (apply to every painting):
- Render every pixel as part of a cohesive oil painting — no photographic realism.
- Use thick, visible impasto brushstrokes with textured dabs of paint that show physical canvas texture.
- Soften all hard edges and geometric lines (buildings, fences, windows) into loose painterly forms.
- Apply a warm Golden Hour glow: vibrant yellows and oranges on sunlit surfaces, soft purples on clouds and foliage.
- Use a rich, saturated palette with high contrast between warm sunlit areas and cool blue-toned shadows.
- Preserve the general composition and perspective of the original photo.
- Capture the essence and mood of the scene rather than exact photographic details.
`.trim();

export const PAINT_STYLES: PaintStyle[] = [
  {
    id: "monet",
    label: "Monet",
    tint: "rgba(180,210,230,0.3)",
    prompt: `Transform this photo into an Impressionist oil painting in the style of Claude Monet. Use soft feathery brushstrokes and shimmering broken colour to capture light on water, foliage, and sky. Favour a cool, luminous palette of blues, greens, lilacs, and creamy whites, punctuated by golden reflections. Dissolve hard outlines into atmosphere.

${BASE_REQUIREMENTS}`,
  },
  {
    id: "vangogh",
    label: "Van Gogh",
    tint: "rgba(255,200,80,0.25)",
    prompt: `Transform this photo into a Post-Impressionist oil painting in the style of Vincent van Gogh. Use bold, swirling directional brushstrokes that follow the contours of every surface — sky, ground, foliage, buildings. Apply thick impasto paint with strong emotional intensity. Use vivid contrasting complementary colours: cobalt blues against burning yellows, emerald greens against flame oranges.

${BASE_REQUIREMENTS}`,
  },
  {
    id: "renoir",
    label: "Renoir",
    tint: "rgba(240,180,150,0.25)",
    prompt: `Transform this photo into an Impressionist oil painting in the style of Pierre-Auguste Renoir. Use warm, luminous, feathery brushwork that creates a soft dappled-light effect across every surface. Favour a warm palette of peach, rose, golden yellow, and soft green, with gentle lilac shadows. Render the scene with joyful, sun-drenched warmth.

${BASE_REQUIREMENTS}`,
  },
  {
    id: "seurat",
    label: "Seurat",
    tint: "rgba(200,220,180,0.22)",
    prompt: `Transform this photo into a Pointillist oil painting in the style of Georges Seurat. Build every area of the image from thousands of small, distinct, round dots of pure unmixed colour placed in close proximity — let the viewer's eye optically blend them. Apply a scientific approach to colour: use complementary dot pairs to create vibrant contrast and luminosity. Maintain a serene, structured composition.

${BASE_REQUIREMENTS}`,
  },
  {
    id: "turner",
    label: "Turner",
    tint: "rgba(255,200,100,0.28)",
    prompt: `Transform this photo into a Romantic oil painting in the style of J.M.W. Turner. Flood the scene with dramatic golden and amber light emanating from a central luminous source. Dissolve edges into atmospheric mist and loose expressive washes of colour. Emphasise the sublime power of the natural scene — sky, clouds, and light should dominate. Use Turner's signature vortex of warm yellows, burning oranges, and steely blues.

${BASE_REQUIREMENTS}`,
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
