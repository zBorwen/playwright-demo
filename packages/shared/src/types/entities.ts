import { z } from 'zod';
import { 
  ProjectSchema, 
  RecordingSchema, 
  ExecutionSchema, 
  ExecutionArtifactSchema, 
  ExecutionSummarySchema 
} from '../schema/entities.js';
import { type RecordingAction } from '../schema/actions.js';

export type Project = z.infer<typeof ProjectSchema>;
export type Recording = z.infer<typeof RecordingSchema> & {
  actions?: RecordingAction[];
  // Legacy compatibility: some code still uses recordingId
  recordingId?: string;
};
export type Execution = z.infer<typeof ExecutionSchema>;
export type ExecutionArtifact = z.infer<typeof ExecutionArtifactSchema>;
export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;

export interface ReplayStep {
  index: number;
  actionName: string;
  detail: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  error?: string;
  screenshot?: string;
}
