// deno run --allow-env --allow-net --allow-read
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Choose a 16:9 size YouTube accepts. 1280x720 is standard.
const WIDTH = 1280;
const HEIGHT = 720;

// If you're using Google AI Studio's Images API (aka Imagen via Gemini API):
const IMAGES_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagegeneration:generate";

type GenerateBody = { prompt: string; style?: string; seed?: number };

function b64ToUint8(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function callImagen(prompt: string) {
  // NOTE: If you're on **Vertex AI** instead, swap this fetch() to the Vertex endpoint
  // and auth with a Google service account. This path is for Google AI Studio (API key).
  const url = `${IMAGES_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  // Body shape can vary by model/version. This works with the current Images API.
  // If you use a specific model (e.g., "imagen-3.0-fast"), add it in the URL or body if required.
  const body = {
    // Some deployments use { "prompt": { "text": "..." } }; this API accepts flat text too.
    prompt,
    // Ask for 1280x720 output (16:9). If your plan only allows preset sizes, pick the closest.
    // Many implementations accept dimensions or a named size. Keep both for compatibility.
    imageSize: `${WIDTH}x${HEIGHT}`,
    // Optional styling hints:
    // negativePrompt: "blurry, low quality, watermark, text artifacts",
    // safetySettings: [{ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK" }],
    // n: 1
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Imagen call failed: ${res.status} ${errText}`);
  }

  const data = await res.json() as any;

  // Typical responses include base64-encoded PNG/JPG bytes.
  // Adjust this path if your response structure differs (e.g., data.images[0].bytesBase64).
  const b64 =
    data?.images?.[0]?.base64 || data?.candidates?.[0]?.image?.base64 || data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image payload returned");

  return b64ToUint8(b64);
}

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Require auth – remove if you allow anonymous
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { prompt }: GenerateBody = await req.json().catch(() => ({} as any));
    if (!prompt || typeof prompt !== "string")
      return new Response("Missing prompt", { status: 400 });

    // Call Imagen/Gemini Images API
    const bytes = await callImagen(prompt);

    // Store to Supabase Storage
    const filename = `${crypto.randomUUID()}.png`;
    const { error: uploadErr } = await supabase
      .storage
      .from("thumbnails")
      .upload(filename, bytes, { contentType: "image/png", upsert: true });
    if (uploadErr) throw uploadErr;

    // Signed URL (1h). Use a shorter/longer TTL to taste.
    const { data: signed, error: signErr } = await supabase
      .storage
      .from("thumbnails")
      .createSignedUrl(filename, 60 * 60);
    if (signErr) throw signErr;

    return new Response(JSON.stringify({
      url: signed?.signedUrl,
      width: WIDTH,
      height: HEIGHT,
      file: filename,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});