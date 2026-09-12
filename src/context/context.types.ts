export interface RecentEventResult {
  id: string;
  title: string;
  date?: string;
  status?: string;
}

export interface RecentWorkerResult {
  id: string;
  fullName: string;
  category?: string;
  status?: string;
}

export interface SessionState {
  sessionId: string;
  currentEventId: string | null;
  currentEventLabel: string | null;
  currentWorkerId: string | null;
  currentWorkerLabel: string | null;
  recentEventResults: RecentEventResult[];
  recentWorkerResults: RecentWorkerResult[];
}
