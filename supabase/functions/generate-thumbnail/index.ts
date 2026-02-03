// deno run --allow-env --allow-net --allow-read
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Choose a 16:9 size YouTube accepts. 1280x720 is standard.
const WIDTH = 1280;
const HEIGHT = 720;

// Imagen 4 model for image generation
const IMAGE_GENERATION_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict";

// Gemini for text analysis
const GEMINI_TEXT_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

type GenerateBody = {
  prompt: string;
  style?: string;
  seed?: number;
  subjectImageUrl?: string;
  referenceImageUrls?: string[];
  baseImageUrl?: string;
  adjustmentMode?: boolean;
  allowTextFallback?: boolean;
  eraseMask?: string;
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

// Note: seed parameter removed - Imagen 4 does not support seeds (unlike Imagen 3)
async function callGeminiImagePreview(prompt: string, subjectImageUrl?: string, referenceImageUrls?: string[], baseImageUrl?: string, isBlankFrame?: boolean) {
  // Detect if the prompt suggests text should be included
  const lowerPrompt = prompt.toLowerCase();
  
  // Determine if this type of content typically has text on thumbnails
  const shouldIncludeText = 
    lowerPrompt.includes('review') ||
    lowerPrompt.includes(' vs ') ||
    lowerPrompt.includes('versus') ||
    lowerPrompt.includes('podcast') ||
    lowerPrompt.includes('gamer') ||
    lowerPrompt.includes('tutorial') ||
    lowerPrompt.includes('how to') ||
    lowerPrompt.match(/top\s*\d+/i) ||
    lowerPrompt.includes('best') ||
    lowerPrompt.includes('unboxing') ||
    lowerPrompt.includes('reaction');

  // Build the prompt for image generation - pure descriptive language only
  let fullPrompt = shouldIncludeText 
    ? `A ${prompt}, large close-up filling the frame, cinematic lighting, clean gradient background, with bold stylized text overlay`
    : `A ${prompt}, large close-up filling the frame, cinematic lighting, clean gradient background, photorealistic`;

  // Add context about reference images to the prompt (Imagen 4 is text-only for generation)
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    fullPrompt += ", inspired by reference style";
  }

  // Add context about subject if provided
  if (subjectImageUrl) {
    fullPrompt += " Feature a person prominently in the thumbnail.";
  }

  // Imagen 4 API request format
  // Note: Imagen 4 does NOT support the seed parameter (unlike Imagen 3)
  const requestBody: any = {
    instances: [
      { prompt: fullPrompt }
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: "16:9",
      personGeneration: "allow_adult"
    }
  };

  const response = await fetch(IMAGE_GENERATION_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Imagen 4 API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  // Imagen 4 response format
  if (!result.predictions || result.predictions.length === 0) {
    console.log('Imagen 4 response:', JSON.stringify(result, null, 2));
    throw new Error("No image generated from Imagen 4 API");
  }

  const prediction = result.predictions[0];
  if (prediction.bytesBase64Encoded) {
    return b64ToUint8(prediction.bytesBase64Encoded);
  }

  throw new Error("Imagen 4 did not return image data in response");
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

async function createMaskedImage(baseImageUrl: string, maskSvgPath: string): Promise<string> {
  // This function creates a composite image with the mask overlay painted on it
  // The mask will be rendered as a semi-transparent red overlay

  // Since Deno doesn't have native canvas support, we'll use an external service
  // or send the SVG path as metadata for the AI to interpret

  // For now, we'll return the original image URL and rely on the AI's vision
  // to see the red overlay we're drawing on the frontend
  // In a production system, you'd want to:
  // 1. Use a canvas library to composite the mask onto the image
  // 2. Or use an external service like Cloudinary to overlay the mask
  // 3. Or send mask coordinates as structured data

  console.log('Mask path received:', maskSvgPath);
  return baseImageUrl;
}

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const contentType = req.headers.get("Content-Type") ?? "";
    console.log('Request content-type:', contentType);
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Auth disabled for testing - re-enable in production
    // const { data: { user } } = await supabase.auth.getUser();
    // if (!user) return new Response("Unauthorized", { status: 401 });

    // Get raw body text first for debugging
    const rawBody = await req.text();
    console.log('Raw request body length:', rawBody.length);
    console.log('Raw request body:', rawBody.substring(0, 500));
    
    if (!rawBody || rawBody.length < 10) {
      return new Response(JSON.stringify({ error: "Empty or invalid request body" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let body: GenerateBody;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON in request body", raw: rawBody.substring(0, 100) }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { prompt, subjectImageUrl, referenceImageUrls, baseImageUrl, adjustmentMode, allowTextFallback, eraseMask } = body;
    
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt", receivedBody: body }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // If eraseMask is provided, we're doing inpainting
    let effectiveBaseImageUrl = baseImageUrl;
    if (eraseMask && baseImageUrl) {
      console.log('Inpainting mode: mask provided');
      // In a full implementation, you would composite the mask onto the image here
      // For now, we rely on the visual red overlay the user already sees on their screen
      effectiveBaseImageUrl = await createMaskedImage(baseImageUrl, eraseMask);
    }

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

    // Always use Imagen 4 for image generation
    if (baseImageUrl) {
      console.log('Using Imagen 4 for adjustment mode...');
    } else if (subjectImageUrl || (referenceImageUrls && referenceImageUrls.length > 0)) {
      console.log('Using Imagen 4 for generation with image context...');
    } else {
      console.log('Using Imagen 4 for text-only generation...');
    }

    // Use blank frame as base image if available and no other base image
    const effectiveBaseImage = effectiveBaseImageUrl || blankFrameUrl;
    const isUsingBlankFrame = !effectiveBaseImageUrl && !!blankFrameUrl;

    // Create 3 distinct variation prompts with different visual moods
    // Note: Imagen 4 doesn't support seeds, so we rely on prompt variations for diversity

    const variation1Prompt = `${finalPrompt} Visual mood: dramatic lighting, strong contrast, cinematic framing.`;
    const variation2Prompt = `${finalPrompt} Visual mood: energetic composition, dynamic angles, vibrant aesthetic.`;
    const variation3Prompt = `${finalPrompt} Visual mood: clean minimal look, soft tones, simple composition.`;

    // Generate 3 variations in parallel with different prompts
    let bytes1: Uint8Array, bytes2: Uint8Array, bytes3: Uint8Array;
    try {
      [bytes1, bytes2, bytes3] = await Promise.all([
        callGeminiImagePreview(variation1Prompt, subjectImageUrl, referenceImageUrls, effectiveBaseImage, isUsingBlankFrame),
        callGeminiImagePreview(variation2Prompt, subjectImageUrl, referenceImageUrls, effectiveBaseImage, isUsingBlankFrame),
        callGeminiImagePreview(variation3Prompt, subjectImageUrl, referenceImageUrls, effectiveBaseImage, isUsingBlankFrame)
      ]);
    } catch (error) {
      console.error('Imagen 4 generation failed:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }

    // Get user ID from auth for namespacing
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'anonymous';

    // Store 3 images to Supabase Storage with user-specific paths
    const filename1 = `${userId}/${crypto.randomUUID()}.png`;
    const filename2 = `${userId}/${crypto.randomUUID()}.png`;
    const filename3 = `${userId}/${crypto.randomUUID()}.png`;

    const [upload1, upload2, upload3] = await Promise.all([
      supabase.storage.from("thumbnails").upload(filename1, bytes1, { contentType: "image/png", upsert: true }),
      supabase.storage.from("thumbnails").upload(filename2, bytes2, { contentType: "image/png", upsert: true }),
      supabase.storage.from("thumbnails").upload(filename3, bytes3, { contentType: "image/png", upsert: true })
    ]);

    if (upload1.error) throw upload1.error;
    if (upload2.error) throw upload2.error;
    if (upload3.error) throw upload3.error;

    // Generate long-lived signed URLs (7 days) for 3 images
    // The app will download these to permanent local storage immediately
    const SEVEN_DAYS = 7 * 24 * 60 * 60; // 7 days in seconds
    const [signed1, signed2, signed3] = await Promise.all([
      supabase.storage.from("thumbnails").createSignedUrl(filename1, SEVEN_DAYS),
      supabase.storage.from("thumbnails").createSignedUrl(filename2, SEVEN_DAYS),
      supabase.storage.from("thumbnails").createSignedUrl(filename3, SEVEN_DAYS)
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
