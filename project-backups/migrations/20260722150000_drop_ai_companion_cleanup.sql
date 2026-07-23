-- Cleanup migration: Drop AI Companion database objects.
-- Created: 2026-07-22
-- Status: NOT auto-applied. Requires explicit approval before execution.
-- Reason: AI Companion feature has been removed from the application.

-- ============================================================
-- TABLES TO DROP
-- ============================================================
-- ai_conversations  — user conversation threads with AI
-- ai_messages       — individual messages (user + assistant roles)
-- ai_usage          — rate limit and usage tracking
-- ai_feedback       — user feedback on AI responses

-- ============================================================
-- DROP TABLES (cascade removes RLS policies, indexes, triggers)
-- ============================================================
DROP TABLE IF EXISTS public.ai_feedback CASCADE;
DROP TABLE IF EXISTS public.ai_usage CASCADE;
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;

-- ============================================================
-- SUPABASE SECRETS TO REMOVE (manual, via dashboard or CLI)
-- ============================================================
-- AI_PROVIDER     — no longer needed
-- AI_MODEL        — no longer needed
-- GROQ_API_KEY    — no longer needed (if using Groq)
-- OPENAI_API_KEY  — no longer needed (if using OpenAI)
-- GEMINI_API_KEY  — no longer needed (if using Gemini)

-- ============================================================
-- EDGE FUNCTION TO REMOVE (already deleted from repo)
-- ============================================================
-- supabase/functions/ai-companion/index.ts — DELETED
-- supabase functions delete ai-companion  — run manually if deployed
