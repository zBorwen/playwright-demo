import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { db } from '../db/index';
import { recordings, executions, executionArtifacts } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { StorageService } from './storage';

const STORAGE_BASE = path.resolve(process.env.STORAGE_PATH || './storage');

/** Agent 传入的文件路径允许的前缀目录列表 */
const ALLOWED_PATH_PREFIXES = [
  os.tmpdir(),
  STORAGE_BASE,
];

/**
 * 校验 agent 传入的文件路径是否在允许的目录范围内。
 * 防止恶意 agent 通过路径遍历读取服务器任意文件。
 */
function validateAgentFilePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const isAllowed = ALLOWED_PATH_PREFIXES.some(
    (prefix) => resolved.startsWith(prefix + path.sep) || resolved === prefix,
  );
  if (!isAllowed) {
    throw new Error(`拒绝访问路径: ${resolved}（不在允许范围内）`);
  }
}

export async function processReplayArtifact(
  storage: StorageService,
  payload: {
    executionId: string;
    recordingId: string;
    index: number;
    type: 'screenshot' | 'har' | 'trace';
    path: string;
  }
) {
  const { executionId, index, type, path: agentLocalPath } = payload;

  if (type === 'screenshot') {
    try {
      validateAgentFilePath(agentLocalPath);
      const buffer = await readFile(agentLocalPath);
      const serverPath = await storage.saveExecutionScreenshot(executionId, index, buffer);

      // Record in DB
      await db.insert(executionArtifacts).values({
        executionId,
        type: 'screenshot',
        path: serverPath,
        stepIndex: index,
      });

      return { serverPath };
    } catch (err) {
      console.error(`[ExecutionService] Failed to process screenshot from ${agentLocalPath}:`, err);
    }
  }
  return null;
}

export async function processReplayDone(
  storage: StorageService,
  payload: {
    executionId: string;
    status: 'passed' | 'failed';
    error?: string;
    tracePath?: string;
    screenshot?: string;
  }
) {
  const { executionId, status, error, tracePath, screenshot } = payload;

  // Save trace file from agent to storage
  if (tracePath) {
    try {
      validateAgentFilePath(tracePath);
      const traceBuffer = await readFile(tracePath);
      await storage.saveTrace(executionId, traceBuffer);
    } catch (err) {
      console.error('Failed to save trace file:', err);
    }
  }

  // Look up recordingId for batch replay progress updates
  const exec = await db
    .select({ recordingId: executions.recordingId })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);

  // Update execution in DB
  await db
    .update(executions)
    .set({
      status,
      error: error ?? null,
      trace: tracePath ? `executions/${executionId}/trace.zip` : (screenshot ?? null),
      finishedAt: new Date(),
    })
    .where(eq(executions.id, executionId));

  if (exec.length) {
    const recording = await db
      .select({ title: recordings.title, projectId: recordings.projectId })
      .from(recordings)
      .where(eq(recordings.id, exec[0].recordingId))
      .limit(1);
    
    return {
      recordingId: exec[0].recordingId,
      recordingTitle: recording[0]?.title,
      projectId: recording[0]?.projectId || undefined,
    };
  }
  return null;
}

export async function cleanupOrphanedExecutions(recordingIds: string[]) {
  if (recordingIds.length === 0) return;
  
  await db
    .update(executions)
    .set({
      status: 'failed',
      error: 'Agent disconnected',
      finishedAt: new Date(),
    })
    .where(inArray(executions.recordingId, recordingIds));
}
