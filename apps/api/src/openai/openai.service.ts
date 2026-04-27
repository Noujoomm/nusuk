import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private client: OpenAI | null = null;
  private logger = new Logger('OpenAIService');

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.logger.log('OpenAI client initialized');
    } else {
      this.logger.warn(
        'OPENAI_API_KEY not set — AI features will be disabled',
      );
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  private ensureClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        'OpenAI is not configured. Set the OPENAI_API_KEY environment variable to enable AI features.',
      );
    }
    return this.client;
  }

  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[] }>,
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<string> {
    try {
      const client = this.ensureClient();
      const response = await client.chat.completions.create({
        model: options?.model || this.config.get('OPENAI_MODEL', 'gpt-4o'),
        messages: messages as any,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens || 4096,
      });
      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('OpenAI chat error', error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const client = this.ensureClient();
      const response = await client.embeddings.create({
        model: this.config.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('OpenAI embedding error', error);
      throw error;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const client = this.ensureClient();
      const response = await client.embeddings.create({
        model: this.config.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
        input: texts,
      });
      return response.data.map((d) => d.embedding);
    } catch (error) {
      this.logger.error('OpenAI batch embedding error', error);
      throw error;
    }
  }

  /**
   * Transcribe an Arabic audio buffer using Whisper. The `prompt` hint
   * (سياق العمل) helps Whisper bias toward business/PMO terminology rather
   * than generic dictation, which substantially reduces mis-transcription
   * for KPI numbers and project jargon.
   */
  async transcribeAudio(
    buffer: Buffer,
    options?: { fileName?: string; mimeType?: string; promptHint?: string },
  ): Promise<{ text: string; language?: string }> {
    const client = this.ensureClient();
    // OpenAI SDK accepts a File-like with a `name`; Node's File polyfill is
    // available since Node 20. Naming sets the extension Whisper uses to
    // pick the decoder, so we prefer the original name when given.
    const fileName = options?.fileName ?? 'audio.webm';
    const mimeType = options?.mimeType ?? 'audio/webm';
    const file = new File([new Uint8Array(buffer)], fileName, { type: mimeType });

    const response = await client.audio.transcriptions.create({
      file,
      model: this.config.get('OPENAI_WHISPER_MODEL', 'whisper-1'),
      language: 'ar',
      prompt:
        options?.promptHint ??
        'تقرير عمل لمشروع بطاقة نسك يحتوي على إنجازات وتحديات ومؤشرات أداء وأرقام وتواريخ.',
      response_format: 'verbose_json',
    } as any);

    const data = response as unknown as { text: string; language?: string };
    return { text: data.text, language: data.language };
  }
}
