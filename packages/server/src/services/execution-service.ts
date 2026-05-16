import { readFile } from 'node:fs/promises';
import { db } from '../db/index';
import { recordings, executions, executionArtifacts } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { StorageService } from './storage';

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
