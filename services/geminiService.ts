import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getModuleSpecs = async (brand: string, model: string): Promise<string> => {
    try {
        const prompt = `Act as an LED technician. Provide technical specs for the LED Tile: ${brand} ${model}. Return ONLY a JSON object with these keys: { "width_mm": number, "height_mm": number, "weight_kg": number, "max_power_w": number, "pixels_h": number, "pixels_v": number }. Do not add markdown code blocks.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("AI Error:", error);
        throw new Error("Failed to fetch module specs");
    }
};

export const analyzeSafety = async (summary: string): Promise<string> => {
    try {
        const prompt = `Actúa como un Rigger certificado. Analiza la seguridad de este montaje LED en ESPAÑOL basado en los siguientes datos: ${summary}. Proporciona 3 recomendaciones clave de seguridad y advierte si hay algún parámetro peligroso.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 0 } // Disable thinking for faster response for this simple task
            }
        });

        return response.text;
    } catch (error) {
        console.error("AI Error:", error);
        throw new Error("Failed to analyze safety");
    }
};