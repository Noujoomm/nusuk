import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

export interface StoredFile {
  storedName: string;
  storagePath: string;
  storageProvider: 'LOCAL' | 'S3';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: 'LOCAL' | 'S3';
  private readonly uploadDir: string;
  private readonly s3Endpoint?: string;
  private readonly s3Bucket?: string;
  private readonly s3AccessKey?: string;
  private readonly s3SecretKey?: string;
  private readonly s3Region?: string;

  constructor(private config: ConfigService) {
    this.provider = (config.get<string>('STORAGE_PROVIDER', 'LOCAL') as 'LOCAL' | 'S3');
    this.uploadDir = config.get<string>('UPLOAD_DIR', join(process.cwd(), 'uploads', 'daily-updates'));

    if (this.provider === 'S3') {
      this.s3Endpoint = config.get<string>('S3_ENDPOINT');
      this.s3Bucket = config.get<string>('S3_BUCKET');
      this.s3AccessKey = config.get<string>('S3_ACCESS_KEY');
      this.s3SecretKey = config.get<string>('S3_SECRET_KEY');
      this.s3Region = config.get<string>('S3_REGION', 'auto');
    }

    // Ensure local upload directory exists
    if (this.provider === 'LOCAL') {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(file: Express.Multer.File): Promise<StoredFile> {
    const ext = extname(file.originalname).toLowerCase();
    const storedName = `${randomUUID()}${ext}`;

    if (this.provider === 'S3') {
      return this.uploadToS3(file, storedName);
    }
    return this.uploadToLocal(file, storedName);
  }

  async delete(storagePath: string, provider: string): Promise<void> {
    if (provider === 'S3') {
      return this.deleteFromS3(storagePath);
    }
    return this.deleteFromLocal(storagePath);
  }

  async getStream(storagePath: string, provider: string): Promise<fs.ReadStream> {
    if (provider === 'S3') {
      return this.getStreamFromS3(storagePath);
    }
    return this.getStreamFromLocal(storagePath);
  }

  // ─── LOCAL STORAGE ───

  private async uploadToLocal(file: Express.Multer.File, storedName: string): Promise<StoredFile> {
    const storagePath = join(this.uploadDir, storedName);

    // file.path exists if multer used diskStorage, otherwise use buffer
    if (file.path) {
      fs.copyFileSync(file.path, storagePath);
      // Clean up multer temp file
      try { fs.unlinkSync(file.path); } catch {}
    } else if (file.buffer) {
      fs.writeFileSync(storagePath, file.buffer);
    }

    return { storedName, storagePath, storageProvider: 'LOCAL' };
  }

  private async deleteFromLocal(storagePath: string): Promise<void> {
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete local file: ${storagePath}`, err);
    }
  }

  private async getStreamFromLocal(storagePath: string): Promise<fs.ReadStream> {
    if (!fs.existsSync(storagePath)) {
      throw new Error(`File not found: ${storagePath}`);
    }
    // Prevent path traversal
    const resolvedPath = fs.realpathSync(storagePath);
    const resolvedUploadDir = fs.realpathSync(this.uploadDir);
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      throw new Error('Access denied');
    }
    return fs.createReadStream(resolvedPath);
  }

  // ─── S3 STORAGE (placeholder — activate when S3 creds are available) ───

  private async uploadToS3(file: Express.Multer.File, storedName: string): Promise<StoredFile> {
    // When S3 is configured, use @aws-sdk/client-s3
    // For now, fall back to local with S3 flag
    this.logger.warn('S3 not fully configured — falling back to local storage');
    const result = await this.uploadToLocal(file, storedName);
    return { ...result, storageProvider: 'LOCAL' };
  }

  private async deleteFromS3(storagePath: string): Promise<void> {
    this.logger.warn('S3 delete not implemented — falling back to local');
    return this.deleteFromLocal(storagePath);
  }

  private async getStreamFromS3(storagePath: string): Promise<fs.ReadStream> {
    this.logger.warn('S3 stream not implemented — falling back to local');
    return this.getStreamFromLocal(storagePath);
  }
}
