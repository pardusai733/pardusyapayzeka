
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: {
    data: string; // base64
    mimeType: string;
  };
}

export enum LoadingStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  ERROR = 'error'
}
