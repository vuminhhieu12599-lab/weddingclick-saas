/**
 * Task 024 Phase 2 §0/§9 — single source of truth for the Storage bucket
 * name. Never scatter the raw "project-media" string through production
 * code; always import this constant instead.
 */
export const PROJECT_MEDIA_BUCKET = "project-media" as const;
