export interface ReplayStep {
  index: number;
  actionName: string;
  detail: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  error?: string;
}
