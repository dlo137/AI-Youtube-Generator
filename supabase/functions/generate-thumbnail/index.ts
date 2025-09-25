// deno run --allow-env --allow-net --allow-read
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Choose a 16:9 size YouTube accepts. 1280x720 is standard.
const WIDTH = 1280;
const HEIGHT = 720;

// Gemini 2.5 Flash with native image generation (may be free tier compatible)
const IMAGES_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-exp:generateContent";

type GenerateBody = { prompt: string; style?: string; seed?: number };

function b64ToUint8(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function callImagen(prompt: string) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { 
          sampleCount: 1, 
          aspectRatio: "16:9" 
        }
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Imagen API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  
  if (!result.predictions || !result.predictions[0]) {
    throw new Error("No image generated from Imagen API");
  }

  // Extract base64 image data from the response
  const imageData = result.predictions[0].bytesBase64Encoded || result.predictions[0].image?.bytesBase64Encoded;
  
  if (!imageData) {
    throw new Error("No image data in Imagen API response");
  }

  return b64ToUint8(imageData);
}

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Auth disabled for testing - re-enable in production
    // const { data: { user } } = await supabase.auth.getUser();
    // if (!user) return new Response("Unauthorized", { status: 401 });

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
      imageUrl: signed?.signedUrl,
      url: signed?.signedUrl, // keep for compatibility
      width: WIDTH,
      height: HEIGHT,
      file: filename,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});