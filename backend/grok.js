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
  "type": "general" | "google-search" | "youtube-search" | "youtube-play" | "youtube-open" | "get-time" | "get-date" | "get-day" | "get-month" | "calculator-open" | "instagram-open" | "facebook-open" | "weather-show",
  "userInput": "<original user input>",
  "response": "<a short spoken response to read out loud to the user>"
}

Instructions:
- "type": determine the intent of the user.
- "userInput": original sentence the user spoke (remove your name if exists). If searching, only include the search query.
- "response": A short voice-friendly reply.

Type meanings:
- "general": factual questions.
- "google-search": user wants to search something on Google.
- "youtube-search": search on YouTube.
- "youtube-play": play a video/song on YouTube.
- "youtube-open": user wants to open YouTube homepage.
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
