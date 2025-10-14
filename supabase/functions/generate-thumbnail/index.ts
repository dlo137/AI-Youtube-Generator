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

// Gemini 2.5 Flash Image Preview for direct image generation from images+prompt
const IMAGE_PREVIEW_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";

type GenerateBody = {
  prompt: string;
  style?: string;
  seed?: number;
  subjectImageUrl?: string;
  referenceImageUrls?: string[];
  baseImageUrl?: string;
  adjustmentMode?: boolean;
  allowTextFallback?: boolean;
};

function b64ToUint8(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function detectMimeTypeFromBytes(bytes: Uint8Array): string {
  // Check PNG signature
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return "image/png";
  }

  // Check JPEG signature
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return "image/jpeg";
  }

  // Check WebP signature
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }

  // Check GIF signature
  if (bytes.length >= 6 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
      bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }

  // Default fallback
  return "image/jpeg";
}

async function fetchImageAsBase64(imageUrl: string): Promise<{data: string, mimeType: string}> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new Error("Image URL expired or not accessible");
    }
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  // Try to get MIME type from response headers first
  let mimeType = response.headers.get("content-type");

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // If no MIME type from headers, detect from bytes
  if (!mimeType || !mimeType.startsWith("image/")) {
    mimeType = detectMimeTypeFromBytes(uint8Array);
  }

  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }

  return {
    data: btoa(binary),
    mimeType: mimeType
  };
}

async function analyzeImagesWithGemini(prompt: string, subjectImageUrl?: string, referenceImageUrls?: string[]) {
  const parts: any[] = [{ text: `STYLE TRANSFER TASK: Create a new image inspired by the reference image's composition and style, featuring the subject person.

Base prompt: "${prompt}"

INSTRUCTIONS:
1. REFERENCE IMAGE ANALYSIS: Analyze the reference image(s) for:
   - Pose, body positioning, and gesture
   - Camera angle and framing
   - Lighting direction, mood, and atmosphere
   - Background elements, colors, and textures
   - Clothing style, accessories, and details
   - Artistic style, color palette, and visual tone
   - Text, logos, or graphic elements

2. SUBJECT ANALYSIS: If subject image provided, identify:
   - Person's facial features, hair color/style, skin tone
   - Age, gender, and distinctive characteristics
   - Natural facial expression and head positioning

3. STYLE TRANSFER PROMPT: Create a prompt that:
   - Matches the reference image's composition and visual style
   - Features the subject person in the same pose and setting
   - Maintains similar lighting, color palette, and mood
   - Incorporates the same background and environmental elements
   - Preserves the artistic style and visual tone

OUTPUT FORMAT: "Create an image featuring [subject description] in the style of the reference: [composition details], [lighting and mood], [background elements], [color palette], [artistic style]. The person should be positioned [pose description] with [clothing/accessories details]."

Focus on style matching and natural subject integration.` }];

  // Add reference images if provided
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    for (const refUrl of referenceImageUrls) {
      const imageData = await fetchImageAsBase64(refUrl);
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data
        }
      });
    }
  }

  // Add subject image if provided
  if (subjectImageUrl) {
    const imageData = await fetchImageAsBase64(subjectImageUrl);
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType,
        data: imageData.data
      }
    });
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-exp:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 1000,
          responseModalities: ["TEXT", "IMAGE"]
        }
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
    throw new Error("No content generated from Gemini API");
  }

  // Extract the generated description
  const content = result.candidates[0].content;
  const enhancedPrompt = content.parts?.[0]?.text || prompt;

  return enhancedPrompt;
}

async function callGeminiImagePreview(prompt: string, subjectImageUrl?: string, referenceImageUrls?: string[], baseImageUrl?: string, isBlankFrame?: boolean) {
  // Create explicit prompt based on mode
  let promptText: string;

  const hardRules = `IMPORTANT (obey strictly):
• Native 16:9 aspect ratio (1280×720 pixels). Do NOT generate a different ratio and add black/white bars.
• Full-bleed image: background must touch all four canvas edges - top, bottom, left, and right.
• Absolutely NO borders, frames, strokes, outlines, vignettes, drop-shadow rims, or poster margins.
• NO black bars, white bars, letterboxing, or pillarboxing at top/bottom or left/right.
• Safe margins are INVISIBLE spacing only; do not draw lines/boxes to indicate them.
• Keep a 6–8% safe margin for faces/text; never exceed 10%.
• No cropped faces or cropped text.
• Main subject fills 60–75% of frame height (no tiny subject).
• Headline spans 70–90% of frame width and stays inside safe area.
• Avoid large empty areas or big white borders.
• Balanced, center-weighted framing unless otherwise stated.`;

  if (baseImageUrl) {
    promptText = `${hardRules}

Edit the given 1280×720 image. Keep all faces/text inside safe margins; if needed, tighten composition without creating any border or frame.
${prompt}`;
  } else {
    promptText = `${hardRules}

Generate a 1280×720 YouTube thumbnail. Leave breathing room for faces/text but do not render any visible border.
${prompt}`;
  }

  const parts: any[] = [{ text: promptText }];

  // Add base image first if provided (for adjustment mode)
  if (baseImageUrl) {
    parts.push({ text: "BASE IMAGE (edit this exact image; maintain full-bleed with no borders):" });
    const baseImageData = await fetchImageAsBase64(baseImageUrl);
    parts.push({
      inlineData: {
        mimeType: baseImageData.mimeType,
        data: baseImageData.data
      }
    });
  }

  // Add reference images if provided
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    for (let i = 0; i < referenceImageUrls.length; i++) {
      parts.push({ text: `REFERENCE IMAGE ${i + 1} (composition only; IGNORE any border/frame/outline in the reference; use interior content only):` });
      const imageData = await fetchImageAsBase64(referenceImageUrls[i]);
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data
        }
      });
    }
  }

  // Add subject image if provided
  if (subjectImageUrl) {
    parts.push({ text: "SUBJECT IMAGE (face/body to insert; output must be full-bleed with no borders):" });
    const imageData = await fetchImageAsBase64(subjectImageUrl);
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType,
        data: imageData.data
      }
    });
  }

  const response = await fetch(IMAGE_PREVIEW_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{
        parts: parts
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 1000,
        responseModalities: ["TEXT", "IMAGE"]
      },
      systemInstruction: {
        parts: [{
          text: "You are an expert thumbnail generator. Always create images in 16:9 aspect ratio (1280x720 pixels) suitable for YouTube thumbnails. The output must be horizontal/landscape orientation."
        }]
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Image Preview API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
    throw new Error("No content generated from Gemini Image Preview API");
  }

  // Check if the response contains image data
  const content = result.candidates[0].content;
  if (content.parts && content.parts.length > 0) {
    // Find the first part with image data
    for (const part of content.parts) {
      if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith("image/")) {
        const imageData = part.inlineData.data;
        return b64ToUint8(imageData);
      }
    }
    // No image found in any part
    throw new Error("Gemini Image Preview did not return image data");
  } else {
    // No parts in response
    throw new Error("Gemini Image Preview returned empty response");
  }
}

async function callImagen(prompt: string): Promise<Uint8Array> {
  // TEMPORARY: Return a demo message until billing is enabled
  // You need to enable billing in Google AI Studio to use Imagen API

  throw new Error(`Imagen API requires billing to be enabled.

To fix this:
1. Go to Google AI Studio (ai.google.dev)
2. Enable billing for your project
3. The Imagen API costs $0.04 per image

Your prompt was: "${prompt}"

Alternatively, you can:
- Use free alternatives like Hugging Face's FLUX.1
- Use OpenAI DALL-E (also requires billing)
- Use local Stable Diffusion models`);
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

    const { prompt, subjectImageUrl, referenceImageUrls, baseImageUrl, adjustmentMode, allowTextFallback }: GenerateBody = await req.json().catch(() => ({} as any));
    if (!prompt || typeof prompt !== "string")
      return new Response("Missing prompt", { status: 400 });

    // Use blank frame reference if not in adjustment mode and no base image provided
    let blankFrameUrl: string | undefined;
    if (!baseImageUrl && !adjustmentMode) {
      // Use the pre-uploaded blank frame from Supabase assets bucket
      blankFrameUrl = "https://zxklggjxauvvesqwqvgi.supabase.co/storage/v1/object/sign/assets/1280x720.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xZjhhYzAxYi05MTVjLTQ0YWItOGNmZi1iZTE1MGI3Y2IwNjgiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhc3NldHMvMTI4MHg3MjAuanBnIiwiaWF0IjoxNzU5ODg4NzM5LCJleHAiOjQ5MTM0ODg3Mzl9.9hJa0Js0yoNpbaJACIsXtm_7QxSQLCZq-ZnpLsARsKw";
      console.log('Using blank frame reference for proper framing');
    }

    let finalPrompt = prompt;

    // Enhanced prompt for style transfer with subject integration
    if (subjectImageUrl && referenceImageUrls && referenceImageUrls.length > 0) {
      finalPrompt = `STYLE TRANSFER: Create a 16:9 YouTube thumbnail featuring the subject person in the style and composition of the reference image. Match the reference's pose, lighting, color palette, background elements, and artistic style while naturally integrating the subject person. Maintain the visual mood and framing of the reference. Generate in 1280x720 resolution. ${prompt}`;
    } else if (referenceImageUrls && referenceImageUrls.length > 0) {
      finalPrompt = `Create a 16:9 YouTube thumbnail inspired by the reference image(s) incorporating this concept: ${prompt}. Match the composition, lighting, and visual style. Generate in 1280x720 resolution.`;
    } else if (subjectImageUrl) {
      finalPrompt = `Create a 16:9 YouTube thumbnail featuring the person from the uploaded image: ${prompt}. Generate in 1280x720 resolution.`;
    }

    console.log('Generating with prompt:', finalPrompt);
    console.log('Subject image URL:', subjectImageUrl);
    console.log('Reference image URLs:', referenceImageUrls);
    console.log('Base image URL (adjustment mode):', baseImageUrl);
    console.log('Adjustment mode:', adjustmentMode);

    // Always use Gemini Image Preview for image generation
    if (baseImageUrl) {
      console.log('Using Gemini Image Preview for adjustment mode with base image...');
    } else if (subjectImageUrl || (referenceImageUrls && referenceImageUrls.length > 0)) {
      console.log('Using Gemini Image Preview for direct image generation with images...');
    } else {
      console.log('Using Gemini Image Preview for text-only generation...');
    }

    // Use blank frame as base image if available and no other base image
    const effectiveBaseImage = baseImageUrl || blankFrameUrl;
    const isUsingBlankFrame = !baseImageUrl && !!blankFrameUrl;

    // Create 3 distinct variation prompts
    const variation1Prompt = `${finalPrompt} Style: Bold and dramatic, high contrast colors with a sleek modern design.`;
    const variation2Prompt = `${finalPrompt} Style: Energetic with dynamic composition and aesthetic colors.`;
    const variation3Prompt = `${finalPrompt} Style: Clean and minimal with soft colors and simple composition.`;

    // Generate 3 variations in parallel with different prompts
    let bytes1: Uint8Array, bytes2: Uint8Array, bytes3: Uint8Array;
    try {
      [bytes1, bytes2, bytes3] = await Promise.all([
        callGeminiImagePreview(variation1Prompt, subjectImageUrl, referenceImageUrls, effectiveBaseImage, isUsingBlankFrame),
        callGeminiImagePreview(variation2Prompt, subjectImageUrl, referenceImageUrls, effectiveBaseImage, isUsingBlankFrame),
        callGeminiImagePreview(variation3Prompt, subjectImageUrl, referenceImageUrls, effectiveBaseImage, isUsingBlankFrame)
      ]);
    } catch (error) {
      console.error('Gemini Image Preview failed:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }

    // Store 3 images to Supabase Storage
    const filename1 = `${crypto.randomUUID()}.png`;
    const filename2 = `${crypto.randomUUID()}.png`;
    const filename3 = `${crypto.randomUUID()}.png`;

    const [upload1, upload2, upload3] = await Promise.all([
      supabase.storage.from("thumbnails").upload(filename1, bytes1, { contentType: "image/png", upsert: true }),
      supabase.storage.from("thumbnails").upload(filename2, bytes2, { contentType: "image/png", upsert: true }),
      supabase.storage.from("thumbnails").upload(filename3, bytes3, { contentType: "image/png", upsert: true })
    ]);

    if (upload1.error) throw upload1.error;
    if (upload2.error) throw upload2.error;
    if (upload3.error) throw upload3.error;

    // Generate signed URLs for 3 images
    const [signed1, signed2, signed3] = await Promise.all([
      supabase.storage.from("thumbnails").createSignedUrl(filename1, 60 * 60),
      supabase.storage.from("thumbnails").createSignedUrl(filename2, 60 * 60),
      supabase.storage.from("thumbnails").createSignedUrl(filename3, 60 * 60)
    ]);

    if (signed1.error) throw signed1.error;
    if (signed2.error) throw signed2.error;
    if (signed3.error) throw signed3.error;

    return new Response(JSON.stringify({
      imageUrl: signed1.data?.signedUrl, // keep for compatibility
      url: signed1.data?.signedUrl, // keep for compatibility
      width: WIDTH,
      height: HEIGHT,
      file: filename1,
      variation1: {
        imageUrl: signed1.data?.signedUrl,
        width: WIDTH,
        height: HEIGHT,
        file: filename1,
        prompt: finalPrompt
      },
      variation2: {
        imageUrl: signed2.data?.signedUrl,
        width: WIDTH,
        height: HEIGHT,
        file: filename2,
        prompt: finalPrompt
      },
      variation3: {
        imageUrl: signed3.data?.signedUrl,
        width: WIDTH,
        height: HEIGHT,
        file: filename3,
        prompt: finalPrompt
      }
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});