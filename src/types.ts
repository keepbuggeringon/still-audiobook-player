import type { Maps, Strength } from './analysis';
export interface Chapter { title: string; start: number }
export interface Book {
  analysisError?: string;
  id: string; title: string; filename: string; size: number; duration: number;
  chapters: Chapter[]; maps: Maps; analyzedUntil: number; complete: boolean;
  position: number; strength: Strength; rate: number; updated: number; codec?: string; container?: string;
}
export interface DiagnosticEvent { at: number; type: string; hidden: boolean; position: number; detail?: unknown }
export interface Session {
  id: string; started: number; ended?: number; source: 'synthetic' | 'book';
  events: DiagnosticEvent[]; dropped: number; skipped: number; hiddenSkips: number;
  gaps: number; largestGap: number; verdict: 'pending' | 'heard-working' | 'heard-failure';
  notes: string; environment: Record<string, unknown>;
}
