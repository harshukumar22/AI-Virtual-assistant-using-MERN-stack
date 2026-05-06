import axios from "axios";

/**
 * Helper function to create a delay
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GLOBAL LOCK: Prevents Jarvis from sending multiple requests at once
let isProcessing = false;

const grokResponse = async (command, assistantName, userName, attempt = 1) => {

    // If a request is already running, wait for it
    while (isProcessing) {
        await wait(500);
    }

    try {
        isProcessing = true; // Set lock

        const apiKey = process.env.GROQ_API_KEY;

        const prompt = `You are a virtual assistant named ${assistantName} created by ${userName}. 
You are not xAI. You will now behave like a voice-enabled assistant.

Your task is to understand the user's natural language input and respond with a JSON object like this:

{
  "type": "general" | "google-search" | "youtube-search" | "youtube-play" | "youtube-open" | "get-time" | "get-date" | "get-day" | "get-month" | "calculator-open" | "instagram-open" | "facebook-open" | "weather-show" | "website-open",
  "userInput": "<extracted value based on type>",
  "response": "<a short spoken response to read out loud to the user>"
}

Instructions:
- "type": determine the intent of the user.
- "userInput": depends on type:
  - For "youtube-play": extract ONLY the song/video name (e.g. "Shape of You by Ed Sheeran" → "Shape of You Ed Sheeran")
  - For "youtube-search": extract ONLY the search query
  - For "google-search": extract ONLY the search query
  - For "website-open": extract ONLY the domain or website name (e.g. "open amazon" → "amazon.com", "go to github.com" → "github.com", "open Netflix" → "netflix.com")
  - For all other types: original sentence the user spoke (remove your name if present)
- "response": A short voice-friendly reply.

Type meanings:
- "general": factual questions or general conversation.
- "google-search": user wants to search something on Google.
- "youtube-search": user wants to search on YouTube (browse results).
- "youtube-play": user wants to PLAY a specific song or video on YouTube (keywords: play, song, music, watch).
- "youtube-open": user wants to open the YouTube homepage only.
- "website-open": user wants to open a specific website directly (e.g. "open amazon", "go to github", "open netflix.com"). Do NOT use google-search for this.
- "calculator-open": open calculator.
- "instagram-open": open instagram.
- "facebook-open": open facebook.
- "weather-show": know weather.
- "get-time": current time.
- "get-date": today's date.
- "get-day": current day.
- "get-month": current month.

Important:
- Only respond with the JSON object, nothing else.
- For "youtube-play", userInput must be just the clean song/video title with artist if mentioned.
- For "website-open", userInput must be just the domain like "amazon.com" or "github.com".

now your userInput- ${command}`;

        const result = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
            }
        );

        // 1. Get the text from the API
        let textResponse = result.data.choices[0].message.content;

        // 2. Clean up Markdown (removes ```json etc.)
        textResponse = textResponse.replace(/```json|```/g, "").trim();

        // 3. Parse the JSON response
        const jsonResponse = JSON.parse(textResponse);

        isProcessing = false; // Release lock
        return jsonResponse;

    } catch (error) {
        isProcessing = false;

        // Handle Rate Limits (Error 429)
        if (error.response && error.response.status === 429 && attempt <= 3) {
            const retryDelay = attempt * 15000;
            console.warn(`Rate limit hit. Retrying in ${retryDelay / 1000}s...`);
            await wait(retryDelay);
            return grokResponse(command, assistantName, userName, attempt + 1);
        }

        console.error("Grok Error:", error.message);
        console.error("Grok Error Details:", JSON.stringify(error.response?.data, null, 2));
        return { type: "general", response: "I'm sorry, I encountered an error." };
    }
};

export default grokResponse;
