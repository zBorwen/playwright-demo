import { db } from '../db/index';
import { projects, recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import type { BrowserType, MockRule } from '@playwright-demo/shared';
import { getWsHandlers } from '../context';

export interface ValidRecording {
  id: string;
  title: string;
  projectId: string | null;
}

/** 加载录制操作产物内容，若无则返回 null */
export async function loadActionsArtifact(id: string): Promise<string | null> {
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'actions')))
    .orderBy(desc(recordingArtifacts.createdAt))
    .limit(1);
  return artifact.length ? artifact[0].content : null;
}

/** 加载录制的 Mock 规则，若无则返回空数组 */
export async function loadMockRules(id: string): Promise<MockRule[]> {
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'mock_rules')))
    .limit(1);
  if (artifact.length && artifact[0].content) {
    return JSON.parse(artifact[0].content) as MockRule[];
  }
  return [];
}

/** 从 ID 列表中过滤出有效的录制（存在且有操作产物） */
export async function loadValidRecordings(ids: string[]): Promise<ValidRecording[]> {
  const valid: ValidRecording[] = [];
  for (const id of ids) {
    const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec.length) continue;
    const content = await loadActionsArtifact(id);
    if (content === null) continue;
    valid.push({ id, title: rec[0].title, projectId: rec[0].projectId });
  }
  return valid;
}

/** 执行批量回放的核心逻辑，被 /batch-replay 和 /batch-replay/projects 共用 */
export async function executeBatchReplay(
  validRecordings: ValidRecording[],
  useMock: boolean,
  agentId: string,
  batchId: string,
  headless?: boolean,
  browserType?: BrowserType,
): Promise<{ results: Array<{ recordingId: string; executionId: string; projectId?: string }> }> {
  // 查询项目级别的回放速度设置
  const projectIds = [...new Set(validRecordings.map(r => r.projectId).filter(Boolean))];
  const speedCache = new Map<string, string>();
  if (projectIds.length > 0) {
    const projs = await db.query.projects.findMany({
      where: (projects, { inArray }) => inArray(projects.id, projectIds as string[]),
    });
    for (const p of projs) {
      speedCache.set(p.id, p.replaySpeed || 'normal');
    }
  }

  const handlers = getWsHandlers();
  handlers.broadcastToClients(JSON.stringify({
    type: 'batch-replay:start',
    payload: { batchId, totalRecordings: validRecordings.length },
  }));

  const results: Array<{ recordingId: string; executionId: string; projectId?: string }> = [];
  for (const rec of validRecordings) {
    const content = await loadActionsArtifact(rec.id);
    if (!content) continue;

    const actionsData = JSON.parse(content);
    const mockRules = useMock ? await loadMockRules(rec.id) : [];

    const execution = await db.insert(executions).values({
      recordingId: rec.id,
      status: 'running',
    }).returning();

    handlers.broadcastToClients(JSON.stringify({
      type: 'batch-replay:result',
      payload: {
        batchId,
        recordingId: rec.id,
        recordingTitle: rec.title,
        executionId: execution[0].id,
        projectId: rec.projectId || undefined,
        status: 'running' as const,
      },
    }));

    const sent = handlers.sendToAgent(agentId, {
      type: 'replay:start',
      payload: {
        recordingId: rec.id,
        executionId: execution[0].id,
        actions: actionsData.actions || [],
        harRef: useMock ? `${rec.id}/recording.har` : '',
        mockRules,
        replaySpeed: (speedCache.get(rec.projectId || '') || 'normal') as 'fast' | 'normal' | 'slow',
        headless,
        browserType,
      },
    });

    if (sent) {
      results.push({ recordingId: rec.id, executionId: execution[0].id, projectId: rec.projectId || undefined });
    }
  }

  return { results };
}
