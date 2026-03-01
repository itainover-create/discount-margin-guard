import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        // אנחנו ניגשים ישירות לרשימת המודלים שהמפתח שלך מורשה לראות
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        console.log("--- Available Models for your Key ---");
        data.models.forEach(m => console.log(m.name));
    } catch (e) {
        console.error("Failed to fetch models:", e);
    }
}

listModels();