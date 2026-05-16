import { readFile } from 'node:fs/promises';
import { db } from '../db/index';
import { recordings, recordingArtifacts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { RecordingAction } from '@playwright-demo/shared';
import type { StorageService } from './storage';

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
      recordingId,
      targetUrl: rec.targetUrl ?? '',
      title: rec.title,
      actions,
    });
  }
}
