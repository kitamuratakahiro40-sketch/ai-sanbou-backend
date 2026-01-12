import axios from 'axios';

const GAMMA_API_KEY = process.env.GAMMA_API_KEY;
const GAMMA_API_URL = 'https://public-api.gamma.app/v1.0/generations';

export const createPresentation = async (
  markdownContent: string, 
  userId: string,
  cardCount: number = 4
) => {
  if (!GAMMA_API_KEY) throw new Error("❌ GAMMA_API_KEY is missing in .env");

  console.log(`🚀 [Gamma] Requesting PDF (${cardCount} slides) for User: ${userId}`);

  try {
    const response = await axios.post(
      GAMMA_API_URL,
      {
        inputText: markdownContent,
        textMode: "generate",
        format: "presentation",
        numCards: cardCount,
        cardSplit: "auto", 
        
        // 🔥 ここを変更！ pptx -> pdf
        exportAs: "pdf", 

        textOptions: {
          language: "ja",
          amount: "medium",
          tone: "professional"
        },
        imageOptions: {
          source: "noImages" 
        },
        cardOptions: {
          dimensions: "16x9",
        }
      },
      {
        headers: {
          'X-API-KEY': GAMMA_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ [Gamma] Job Started: ${response.data.id}`);
    return response.data;

  } catch (error: any) {
    console.error("❌ [Gamma] Creation Failed:", JSON.stringify(error.response?.data || error.message));
    throw error;
  }
};

export const checkGammaStatus = async (jobId: string) => {
  if (!GAMMA_API_KEY) throw new Error("GAMMA_API_KEY is missing");
  try {
    const response = await axios.get(`${GAMMA_API_URL}/${jobId}`, {
      headers: { 'X-API-KEY': GAMMA_API_KEY }
    });
    return response.data;
  } catch (error: any) {
    console.error(`❌ [Gamma] Status Check Failed for ${jobId}:`, error.message);
    throw error;
  }
};