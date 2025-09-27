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

async function callGeminiImagePreview(prompt: string, subjectImageUrl?: string, referenceImageUrls?: string[], baseImageUrl?: string) {
  // Create explicit prompt based on mode
  let promptText: string;

  if (baseImageUrl) {
    promptText = `Edit the BASE IMAGE; do not change composition unless explicitly requested.

User request: ${prompt}

IMPORTANT: Use the BASE IMAGE as your starting point. Only make the specific changes requested. Maintain the existing composition, layout, and overall structure unless the user explicitly asks to change them. Generate a 16:9 aspect ratio YouTube thumbnail (1280x720 pixels).`;
  } else {
    promptText = `Create a 16:9 YouTube thumbnail (1280x720 pixels) using the REFERENCE IMAGE composition/style and featuring the SUBJECT IMAGE person.

User request: ${prompt}

Match the REFERENCE IMAGE composition, lighting, color palette, and visual style while naturally integrating the SUBJECT IMAGE person.`;
  }

  const parts: any[] = [{ text: promptText }];

  // Add base image first if provided (for adjustment mode)
  if (baseImageUrl) {
    parts.push({ text: "BASE IMAGE (edit this exact image):" });
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
      parts.push({ text: `REFERENCE IMAGE ${i + 1} (composition):` });
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
    parts.push({ text: "SUBJECT IMAGE (face/body to insert):" });
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

    const { prompt, subjectImageUrl, referenceImageUrls, baseImageUrl, adjustmentMode, allowTextFallback }: GenerateBody = await req.json().catch(() => ({} as any));
    if (!prompt || typeof prompt !== "string")
      return new Response("Missing prompt", { status: 400 });

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

    let bytes1: Uint8Array;

    // Use Gemini Image Preview for direct image generation when images are provided
    if (baseImageUrl || subjectImageUrl || (referenceImageUrls && referenceImageUrls.length > 0)) {
      try {
        if (baseImageUrl) {
          console.log('Using Gemini Image Preview for adjustment mode with base image...');
        } else {
          console.log('Using Gemini Image Preview for direct image generation...');
        }
        bytes1 = await callGeminiImagePreview(finalPrompt, subjectImageUrl, referenceImageUrls, baseImageUrl);
      } catch (error) {
        console.log('Gemini Image Preview failed:', error);

        if (allowTextFallback) {
          console.log('allowTextFallback=true, attempting fallback to Imagen...');
          try {
            console.log('Analyzing images with Gemini to create enhanced prompt...');
            // Use Gemini to analyze the images and create a detailed prompt
            const aiEnhancedPrompt = await analyzeImagesWithGemini(finalPrompt, subjectImageUrl, referenceImageUrls);
            console.log('AI Enhanced Prompt:', aiEnhancedPrompt);

            // Use the enhanced prompt with Imagen
            bytes1 = await callImagen(aiEnhancedPrompt);
          } catch (fallbackError) {
            console.log('AI analysis also failed, using basic enhanced prompt:', fallbackError);
            // Final fallback to Imagen with basic enhanced text prompt
            bytes1 = await callImagen(finalPrompt);
          }
        } else {
          // Return error instead of automatic fallback
          throw new Error(`Image-guided generation failed: ${error.message}`);
        }
      }
    } else {
      // Use standard Imagen for text-only prompts
      bytes1 = await callImagen(finalPrompt);
    }
    // const [bytes1, bytes2] = await Promise.all([
    //   callImagen(variation1Prompt),
    //   callImagen(variation2Prompt)
    // ]);

    // Store one image to Supabase Storage
    const filename1 = `${crypto.randomUUID()}.png`;
    // const filename2 = `${crypto.randomUUID()}.png`;

    const upload1 = await supabase.storage.from("thumbnails").upload(filename1, bytes1, { contentType: "image/png", upsert: true });
    // const [upload1, upload2] = await Promise.all([
    //   supabase.storage.from("thumbnails").upload(filename1, bytes1, { contentType: "image/png", upsert: true }),
    //   supabase.storage.from("thumbnails").upload(filename2, bytes2, { contentType: "image/png", upsert: true })
    // ]);

    if (upload1.error) throw upload1.error;
    // if (upload2.error) throw upload2.error;

    // Generate signed URL for one image
    const signed1 = await supabase.storage.from("thumbnails").createSignedUrl(filename1, 60 * 60);
    // const [signed1, signed2] = await Promise.all([
    //   supabase.storage.from("thumbnails").createSignedUrl(filename1, 60 * 60),
    //   supabase.storage.from("thumbnails").createSignedUrl(filename2, 60 * 60)
    // ]);

    if (signed1.error) throw signed1.error;
    // if (signed2.error) throw signed2.error;

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
      }
      // variation2: {
      //   imageUrl: signed2.data?.signedUrl,
      //   width: WIDTH,
      //   height: HEIGHT,
      //   file: filename2,
      //   prompt: variation2Prompt
      // }
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});