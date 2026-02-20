// deno run --allow-env --allow-net
import { serve } from "https://deno.land/std/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// Use Gemini Flash for fast, lightweight title generation
const GEMINI_TEXT_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

type GenerateTitleBody = {
  prompt: string;
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
      },
    });
  }

  try {
    const body: GenerateTitleBody = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid prompt" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Call Gemini Flash to generate a short, natural title
    const geminiResponse = await fetch(`${GEMINI_TEXT_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Convert this image generation request into a short, natural title.

Rules:
- Remove command words like "put", "add", "create", "make", "generate", "show", "design"
- Keep it under 5 words maximum
- Focus on the main subject/concept only
- Use Title Case capitalization
- Extract only the most meaningful nouns and descriptors
- Only return the title, nothing else

Examples:
"add a realistic golden retriever sitting on a wooden table in a cafe" → "Golden Retriever at Cafe"
"create a dramatic sunset over mountains with snow" → "Sunset Over Snowy Mountains"
"make a tech review thumbnail with laptop and phone" → "Tech Review Setup"
"generate an epic gaming battle scene" → "Epic Gaming Battle"
"show a person cooking in modern kitchen" → "Modern Kitchen Cooking"

Request: "${prompt}"

Title:`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 20,
          topP: 0.8,
        }
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[generate-title] Gemini API error:", errorText);
      // Return a fallback title based on simple extraction
      return new Response(
        JSON.stringify({ title: extractFallbackTitle(prompt) }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const geminiData = await geminiResponse.json();
    let title = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    // Clean up the title - remove quotes, newlines, extra spaces
    title = title
      .replace(/^["']|["']$/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // If title is empty or too long, fall back to simple extraction
    if (!title || title.split(/\s+/).length > 6) {
      title = extractFallbackTitle(prompt);
    }

    return new Response(
      JSON.stringify({ title }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );

  } catch (error: any) {
    console.error("[generate-title] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate title" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

// Fallback title extraction for when API fails
function extractFallbackTitle(prompt: string): string {
  // Words to remove
  const removeWords = new Set([
    'a', 'an', 'the', 'add', 'create', 'make', 'generate', 'show', 'design',
    'put', 'place', 'i', 'want', 'need', 'give', 'me', 'please', 'with',
    'and', 'or', 'but', 'for', 'on', 'in', 'at', 'to', 'of', 'that',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'thumbnail', 'image', 'picture', 'photo', 'youtube', 'video'
  ]);

  // Extract words, filter out common ones
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !removeWords.has(w));

  // Take first 3-4 meaningful words and capitalize
  const titleWords = words.slice(0, 4).map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  );

  return titleWords.join(' ') || 'Untitled';
}
