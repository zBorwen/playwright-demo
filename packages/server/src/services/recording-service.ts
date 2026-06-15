import { readFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db/index';
import { recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { RecordingAction } from '@playwright-demo/shared';
import type { StorageService } from './storage';
import { validateAgentFilePath } from './path-validator';

export async function processRecordingComplete(
  storage: StorageService,
  payload: { recordingId: string; actions: RecordingAction[]; harPath?: string }
) {
  const { recordingId, actions, harPath } = payload;

  await db
    .update(recordings)
    .set({ updatedAt: new Date() })
    .where(eq(recordings.id, recordingId));

  // Upsert: delete only actions artifact, preserve har and mock_rules
  await db
    .delete(recordingArtifacts)
    .where(and(
      eq(recordingArtifacts.recordingId, recordingId),
      eq(recordingArtifacts.type, 'actions'),
    ));

  await db.insert(recordingArtifacts).values({
    recordingId,
    type: 'actions',
    content: JSON.stringify({ recordingId, actions }),
  });

  // Process HAR if available
  if (harPath) {
    try {
      validateAgentFilePath(harPath);
      const harBuffer = await readFile(harPath).catch(() => null);
      if (harBuffer) {
        await storage.saveHar(recordingId, harBuffer);

        const { parseAndFilterHar } = await import('./har-filter');
        const entries = await parseAndFilterHar(harPath);

        // Clean up old har before inserting new one
        await db
          .delete(recordingArtifacts)
          .where(and(
            eq(recordingArtifacts.recordingId, recordingId),
            eq(recordingArtifacts.type, 'har'),
          ));

        await db.insert(recordingArtifacts).values({
          recordingId,
          type: 'har',
          content: JSON.stringify(entries),
        });

        console.log(`HAR processed: ${entries.length} network entries for recording ${recordingId}`);
      } else {
        console.warn(`HAR file not found at ${harPath} for recording ${recordingId}`);
      }
    } catch (err) {
      console.error('Failed to process HAR:', err);
    }
  }

  const rec = await db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });

  if (rec) {
    await storage.saveRecording(recordingId, {
      ...rec,
      id: rec.id,
      recordingId,
      targetUrl: rec.targetUrl ?? '',
      createdAt: rec.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: rec.updatedAt?.toISOString() ?? new Date().toISOString(),
      actions,
    });
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 删除录制及其关联数据（artifacts、executions、存储文件） */
export async function deleteRecording(id: string): Promise<void> {
  if (!UUID_REGEX.test(id)) {
    throw new Error(`无效录制 ID 格式: ${id}`);
  }

  const rec = await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec.length) return;

  // 先清理关联的 artifacts 和 executions
  await db.delete(recordingArtifacts).where(eq(recordingArtifacts.recordingId, id));
  await db.delete(executions).where(eq(executions.recordingId, id));
  // 删除录制记录
  await db.delete(recordings).where(eq(recordings.id, id));
  // 删除存储文件
  const storageBase = path.resolve(process.env.STORAGE_PATH || './storage');
  const storageDir = path.resolve(storageBase, 'recordings', id);
  // 纵深防御：确保解析后的路径在 storage 目录内
  if (!storageDir.startsWith(storageBase + path.sep)) {
    throw new Error('检测到路径遍历');
  }
  await rm(storageDir, { recursive: true, force: true });
}
