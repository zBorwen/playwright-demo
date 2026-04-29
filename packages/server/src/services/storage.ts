import { mkdir, writeFile, readFile } from 'fs/promises';
import type { Recording } from '@playwright-demo/shared';

const STORAGE_BASE = process.env.STORAGE_PATH || './storage';

export class StorageService {
  private base: string;

  constructor(base: string = STORAGE_BASE) {
    this.base = base;
  }

  async saveRecording(recordingId: string, recording: Recording): Promise<string> {
    const dir = `${this.base}/recordings/${recordingId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/actions.json`;
    await writeFile(path, JSON.stringify(recording, null, 2));
    return path;
  }

  async loadRecording(recordingId: string): Promise<Recording | null> {
    try {
      const path = `${this.base}/recordings/${recordingId}/actions.json`;
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content) as Recording;
    } catch {
      return null;
    }
  }

  async saveHar(recordingId: string, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/recordings/${recordingId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/recording.har`;
    await writeFile(path, buffer);
    return path;
  }

  async loadHar(recordingId: string): Promise<Buffer | null> {
    try {
      const path = `${this.base}/recordings/${recordingId}/recording.har`;
      return await readFile(path);
    } catch {
      return null;
    }
  }

  async saveScreenshot(executionId: string, stepIndex: number, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/executions/${executionId}/screenshots`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/step-${stepIndex}.png`;
    await writeFile(path, buffer);
    return path;
  }

  async saveExecutionHar(executionId: string, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/executions/${executionId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/replay.har`;
    await writeFile(path, buffer);
    return path;
  }
}
