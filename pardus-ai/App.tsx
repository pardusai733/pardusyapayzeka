
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, LoadingStatus } from './types';
import { geminiService } from './services/geminiService';
import ChatMessage from './components/ChatMessage';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// Yardımcı Fonksiyonlar (Encoding/Decoding)
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Çita (Cheetah) Logo Bileşeni
const PardusLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C10.5 2 9 2.5 7.5 3.5C6 4.5 5 6 5 8C5 10 6 12 8 13.5V16L10 15V17L12 18L14 17V15L16 16V13.5C18 12 19 10 19 8C19 6 18 4.5 16.5 3.5C15 2.5 13.5 2 12 2Z" fill="currentColor"/>
    <path d="M8.5 8.5C8.5 8.5 8 10 8 11.5" stroke="black" strokeWidth="0.8" strokeLinecap="round" opacity="0.8"/>
    <path d="M15.5 8.5C15.5 8.5 16 10 16 11.5" stroke="black" strokeWidth="0.8" strokeLinecap="round" opacity="0.8"/>
    <circle cx="9" cy="8" r="0.8" fill="black" opacity="0.9"/>
    <circle cx="15" cy="8" r="0.8" fill="black" opacity="0.9"/>
    <path d="M11.5 11.5L12 12L12.5 11.5" stroke="black" strokeWidth="0.5" strokeLinecap="round"/>
    <circle cx="12" cy="5" r="0.4" fill="black" opacity="0.3"/>
    <circle cx="10" cy="4" r="0.3" fill="black" opacity="0.3"/>
    <circle cx="14" cy="4" r="0.3" fill="black" opacity="0.3"/>
  </svg>
);

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [status, setStatus] = useState<LoadingStatus>(LoadingStatus.IDLE);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [userSpeechText, setUserSpeechText] = useState('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const toggleLiveMode = async () => {
    if (isLiveMode) {
      stopAllAudio();
      sessionRef.current?.close();
      setIsLiveMode(false);
      setUserSpeechText('');
      setLiveTranscription('');
      return;
    }

    try {
      setIsLiveMode(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // AI Ses Çıkışı
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => activeSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              stopAllAudio();
            }

            // AI Ne Diyor? (Output Transcription)
            if (message.serverContent?.outputTranscription) {
              setLiveTranscription(prev => prev + message.serverContent!.outputTranscription!.text);
            }

            // Kullanıcı Ne Dedi? (Input Transcription - Algılama)
            if (message.serverContent?.inputTranscription) {
              setUserSpeechText(prev => prev + message.serverContent!.inputTranscription!.text);
            }

            if (message.serverContent?.turnComplete) {
              // Tur tamamlandığında temizle (isteğe bağlı, akış için tutulabilir)
              setTimeout(() => {
                setUserSpeechText('');
                setLiveTranscription('');
              }, 3000);
            }
          },
          onclose: () => setIsLiveMode(false),
          onerror: (e) => console.error("Live Error:", e),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } },
          },
          systemInstruction: 'Sen Pardus AI asistanısın. Çita hızında ve keskinliğinde cevaplar ver. Kim tarafından yapıldığın sorulursa "Beni bir teknofest grubu olan Yapan Zekalar grubu yaptı" de. Sesli sohbet modunda kısa ve öz konuş.',
          outputAudioTranscription: {},
          inputAudioTranscription: {}, // Kullanıcı sesini algılamak için gerekli
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error("Failed to start Live session:", error);
      setIsLiveMode(false);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setSelectedImage({ data: base64String, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && !selectedImage) || status === LoadingStatus.LOADING) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim() || (selectedImage ? "Bu resmi analiz eder misin?" : ""),
      timestamp: new Date(),
      image: selectedImage || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    const imageDataToSend = selectedImage;
    setSelectedImage(null);
    setStatus(LoadingStatus.LOADING);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      let fullResponse = '';
      const stream = geminiService.sendMessageStream(userMessage.content, imageDataToSend || undefined);
      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: fullResponse } : msg));
      }
      setStatus(LoadingStatus.IDLE);
    } catch (error) {
      console.error(error);
      setStatus(LoadingStatus.ERROR);
      setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: "Hata oluştu." } : msg));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 overflow-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="z-50 px-6 py-4 border-b border-white/5 bg-slate-900/40 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center p-1.5 shadow-lg">
            <PardusLogo className="w-full h-full" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">PARDUS AI</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Yapan Zekalar</p>
          </div>
        </div>
        <button 
          onClick={toggleLiveMode}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            isLiveMode ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span>{isLiveMode ? 'DİNLİYOR...' : 'SESLİ SOHBET'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 z-10" ref={scrollRef}>
        <div className="max-w-4xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-6">
              <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl p-6 animate-pulse">
                <PardusLogo className="w-full h-full" />
              </div>
              <h2 className="text-4xl font-black tracking-tighter">Pardus AI'ya Hoş Geldin</h2>
              <p className="text-slate-400 max-w-md">Çita hızıyla cevaplamaya hazırım. Sorularını sorabilir, görsel yükleyebilir veya sesli konuşabilirsin.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-8">
                {["Seni kim yaptı?", "Görsel analiz yap.", "Neler yapabilirsin?", "Bana bir hikaye anlat."].map((q) => (
                  <button 
                    key={q}
                    onClick={() => setInputValue(q)}
                    className="p-4 bg-slate-900/50 border border-white/5 rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-12">
              {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
              {status === LoadingStatus.LOADING && (
                <div className="flex justify-start ml-12">
                  <div className="bg-slate-900/60 border border-white/5 px-4 py-3 rounded-2xl flex space-x-1">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Voice Overlay */}
      {isLiveMode && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center animate-in fade-in">
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-indigo-500 rounded-full blur-[100px] opacity-20 animate-pulse"></div>
            <div className="w-48 h-48 bg-indigo-600 text-white rounded-[4rem] flex items-center justify-center shadow-2xl relative z-10 animate-bounce p-10">
              <PardusLogo className="w-full h-full" />
            </div>
          </div>
          <h2 className="text-3xl font-black mb-2 tracking-tighter">Ses Algılanıyor...</h2>
          
          <div className="w-full max-w-2xl space-y-4 px-8 text-center">
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl min-h-[3rem] flex items-center justify-center">
               <p className="text-indigo-400 font-bold italic">{userSpeechText || "Seni dinliyorum..."}</p>
            </div>
            <div className="p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl min-h-[3rem] flex items-center justify-center">
               <p className="text-white font-medium">{liveTranscription || "Pardus AI yanıtı bekleniyor..."}</p>
            </div>
          </div>

          <button 
            onClick={toggleLiveMode}
            className="mt-12 px-10 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black shadow-xl transition-all active:scale-95"
          >
            SOHBETİ BİTİR
          </button>
        </div>
      )}

      {/* Input Section */}
      <footer className="z-50 p-4 md:p-6 bg-slate-950/80 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          {selectedImage && (
            <div className="mb-4 relative inline-block group">
              <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="w-24 h-24 object-cover rounded-2xl border-2 border-indigo-500" alt="Preview" />
              <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          )}
          <form onSubmit={handleSend} className="relative flex items-center bg-slate-900/90 border border-white/10 rounded-[2rem