import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'node:path';
import type { Recording } from '@playwright-demo/shared';

const STORAGE_BASE = process.env.STORAGE_PATH || './storage';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeId(id: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new Error(`无效 ID 格式: ${id}`);
  }
}

function resolveSafe(base: string, ...segments: string[]): string {
  const fullPath = path.resolve(base, ...segments);
  const normalizedBase = path.resolve(base);
  if (!fullPath.startsWith(normalizedBase + path.sep) && fullPath !== normalizedBase) {
    throw new Error('检测到路径遍历');
  }
  return fullPath;
}

export class StorageService {
  private base: string;

  constructor(base: string = STORAGE_BASE) {
    this.base = base;
  }

  async saveRecording(recordingId: string, recording: Recording): Promise<string> {
    sanitizeId(recordingId);
    const dir = resolveSafe(this.base, 'recordings', recordingId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'actions.json');
    await writeFile(filePath, JSON.stringify(recording, null, 2));
    return filePath;
  }

  async saveHar(recordingId: string, buffer: Buffer): Promise<string> {
    sanitizeId(recordingId);
    const dir = resolveSafe(this.base, 'recordings', recordingId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'recording.har');
    await writeFile(filePath, buffer);
    return filePath;
  }

  async saveTrace(executionId: string, buffer: Buffer): Promise<string> {
    sanitizeId(executionId);
    const dir = await this.getExecutionDir(executionId);
    const tracePath = path.join(dir, 'trace.zip');
    await writeFile(tracePath, buffer);
    return tracePath;
  }

  async saveExecutionScreenshot(executionId: string, stepIndex: number, buffer: Buffer): Promise<string> {
    sanitizeId(executionId);
    const dir = await this.getExecutionDir(executionId);
    const screenshotDir = path.join(dir, 'screenshots');
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `step-${stepIndex}.jpg`);
    await writeFile(screenshotPath, buffer);
    return `executions/${executionId}/screenshots/step-${stepIndex}.jpg`;
  }

  async loadTrace(executionId: string): Promise<Buffer | null> {
    sanitizeId(executionId);
    try {
      const tracePath = resolveSafe(this.base, 'executions', executionId, 'trace.zip');
      return await readFile(tracePath);
    } catch {
      return null;
    }
  }

  private async getExecutionDir(executionId: string): Promise<string> {
    sanitizeId(executionId);
    const dir = resolveSafe(this.base, 'executions', executionId);
    await mkdir(dir, { recursive: true });
    return dir;
  }
}
