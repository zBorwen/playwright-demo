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

  async saveHar(recordingId: string, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/recordings/${recordingId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/recording.har`;
    await writeFile(path, buffer);
    return path;
  }

  async saveTrace(executionId: string, buffer: Buffer): Promise<string> {
    const dir = await this.getExecutionDir(executionId);
    const tracePath = `${dir}/trace.zip`;
    await writeFile(tracePath, buffer);
    return tracePath;
  }

  async saveExecutionScreenshot(executionId: string, stepIndex: number, buffer: Buffer): Promise<string> {
    const dir = await this.getExecutionDir(executionId);
    const screenshotDir = `${dir}/screenshots`;
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = `${screenshotDir}/step-${stepIndex}.jpg`;
    await writeFile(screenshotPath, buffer);
    return `executions/${executionId}/screenshots/step-${stepIndex}.jpg`;
  }

  async loadTrace(executionId: string): Promise<Buffer | null> {
    try {
      const tracePath = `${this.base}/executions/${executionId}/trace.zip`;
      return await readFile(tracePath);
    } catch {
      return null;
    }
  }

  private async getExecutionDir(executionId: string): Promise<string> {
    const dir = `${this.base}/executions/${executionId}`;
    await mkdir(dir, { recursive: true });
    return dir;
  }
}
