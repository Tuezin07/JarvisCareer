import { z } from 'zod';

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export const resumeStatusSchema = z.enum(['UPLOADED', 'PROCESSING', 'EXTRACTED', 'FAILED']);
export type ResumeStatus = z.infer<typeof resumeStatusSchema>;

export const resumeKindSchema = z.enum(['pdf', 'docx', 'txt']);
export type ResumeKind = z.infer<typeof resumeKindSchema>;

export interface ResumeDto {
  id: string;
  originalName: string;
  kind: ResumeKind;
  sizeBytes: number;
  sha256: string;
  status: ResumeStatus;
  isPrimary: boolean;
  pageCount: number | null;
  charCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  extractedAt: string | null;
}

export interface ResumeDetailDto extends ResumeDto {
  extractedText: string | null;
}

export interface DashboardSummary {
  profileCompleteness: { percent: number; missing: string[] };
  resumes: { total: number; extracted: number; processing: number; failed: number };
  events24h: number;
  /** Funcionalidades ainda não implementadas retornam null, nunca zero inventado. */
  applications: null;
  jobsFound: null;
}
