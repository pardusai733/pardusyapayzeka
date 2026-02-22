
import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

const PardusLogoSmall = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C10.5 2 9 2.5 7.5 3.5C6 4.5 5 6 5 8C5 10 6 12 8 13.5V16L10 15V17L12 18L14 17V15L16 16V13.5C18 12 19 10 19 8C19 6 18 4.5 16.5 3.5C15 2.5 13.5 2 12 2Z" fill="currentColor"/>
    <path d="M8.5 8.5C8.5 8.5 8 10 8 11.5" stroke="black" strokeWidth="0.8" strokeLinecap="round" opacity="0.8"/>
    <path d="M15.5 8.5C15.5 8.5 16 10 16 11.5" stroke="black" strokeWidth="0.8" strokeLinecap="round" opacity="0.8"/>
    <circle cx="9" cy="8" r="0.8" fill="black" opacity="0.9"/>
    <circle cx="15" cy="8" r="0.8" fill="black" opacity="0.9"/>
  </svg>
);

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`flex w-full mb-8 ${isAssistant ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] ${isAssistant ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold shadow-lg overflow-hidden ${
          isAssistant 
            ? 'bg-indigo-500 text-white mr-4 p-1' 
            : 'bg-slate-800 text-slate-400 ml-4'
        }`}>
          {isAssistant ? (
            <PardusLogoSmall className="w-full h-full" />
          ) : (
            'SEN'
          )}
        </div>
        <div className={`px-5 py-4 rounded-3xl text-[15px] leading-relaxed shadow-sm ${
          isAssistant 
            ? 'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none' 
            : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/10'
        }`}>
          {message.image && (
            <div className="mb-3 overflow-hidden rounded-2xl border border-white/10">
              <img 
                src={`data:${message.image.mimeType};base64,${message.image.data}`} 
                alt="Uploaded" 
                className="max-h-60 w-full object-cover"
              />
            </div>
          )}
          <div className="whitespace-pre-wrap">{message.content}</div>
          <div className={`text-[9px] mt-2 font-medium opacity-40 uppercase tracking-widest ${isAssistant ? 'text-slate-400' : 'text-indigo-200'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
