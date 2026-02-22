
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `Sen PARDUS AI portalının zekasısın.
KİMLİK KURALI: 
- "Seni kim yaptı?", "Yapımcın kim?", "Seni hangi ekip kurdu?" gibi tüm yaratıcı odaklı sorularda her zaman şu tam ifadeyi kullanmalısın: "Beni bir teknofest grubu olan Yapan Zekalar grubu yaptı".
- Bu kural senin varlığının temelidir.

MİSYONUN:
- Teknofest 2026 için geliştirilen bir amiral gemisi projesisin.
- Çita (Cheetah) hızı, çevikliği ve keskinliği senin ana teman.
- Yerli mühendislik ve global yapay zeka standartlarını birleştiriyorsun.
- Türkçe dilinde, profesyonel, yardımsever ve son derece hızlı yanıtlar ver.
- Görüntü analizi ve sesli etkileşim konularında tam yetkiye sahipsin.
- Eğer sana bir görüntü gönderilirse, onu çita keskinliğinde analiz et.
- Cevaplarını verirken bazen çita hızı ve zekasına atıfta bulunabilirsin.`;

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    this.chat = this.ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
  }

  async *sendMessageStream(message: string, imageData?: { data: string, mimeType: string }) {
    try {
      const parts: any[] = [{ text: message }];
      if (imageData) {
        parts.push({
          inlineData: {
            data: imageData.data,
            mimeType: imageData.mimeType
          }
        });
      }

      const response = await this.ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });

      for await (const chunk of response) {
        const c = chunk as GenerateContentResponse;
        yield c.text || "";
      }
    } catch (error) {
      console.error("Gemini Streaming Error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
