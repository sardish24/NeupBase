-- ==============================================================================
-- Supabase Unified Schema (With all requested redundancies)
-- Combines: chat, course_tree, daily_brief, pwa, main, telemetry, and prisma schemas
-- ==============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==============================================================================
-- 1. Core Academic Hierarchy
-- ==============================================================================

CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID DEFAULT gen_random_uuid(), -- Redundancy
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject_name VARCHAR(255), -- Redundancy
    description TEXT,
    semester_tag VARCHAR(50),
    midterm_date DATE,
    final_exam_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subjects_user_id ON public.subjects(user_id);

CREATE TABLE public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID DEFAULT gen_random_uuid(), -- Redundancy
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE, -- Redundancy
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    topic_name VARCHAR(255), -- Redundancy
    week_number INT CHECK (week_number BETWEEN 1 AND 16),
    course_week_number INT, -- Redundancy
    topic_type VARCHAR(50) CHECK (topic_type IN ('lecture', 'tutorial', 'lab')),
    is_midterm_syllabus BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_topics_subject_id ON public.topics(subject_id);

CREATE TABLE public.subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL
);

-- Course Tree (Adjacency List)
CREATE TABLE public.course_tree (
    node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL,
    parent_id UUID,
    level INT NOT NULL,
    label TEXT NOT NULL,
    resource_hint TEXT,
    resource_file_id UUID,
    week_number INT,
    position INT NOT NULL,
    
    CONSTRAINT fk_course FOREIGN KEY (subject_id) 
        REFERENCES public.subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_parent FOREIGN KEY (parent_id) 
        REFERENCES public.course_tree(node_id) ON DELETE CASCADE,
    CONSTRAINT chk_valid_level CHECK (level IN (1, 2, 3, 4)),
    CONSTRAINT chk_prevent_self_reference CHECK (node_id <> parent_id)
);
CREATE INDEX idx_course_tree_parent_id ON public.course_tree(parent_id);
CREATE INDEX idx_course_tree_subject_id ON public.course_tree(subject_id);
CREATE INDEX idx_course_tree_parent_position ON public.course_tree(parent_id, position);

-- ==============================================================================
-- 2. Tasks & Goals
-- ==============================================================================

CREATE TYPE task_status_enum AS ENUM (
    'completed', 
    'skipped', 
    'deferred', 
    'partial',
    'pending'
);

CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status_enum NOT NULL DEFAULT 'pending',
    time_spent_minutes INT DEFAULT 0,
    est_duration INT DEFAULT 30,
    completion_timestamp TIMESTAMPTZ,
    notes TEXT,
    scheduled_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_status_scheduled ON public.tasks(status, scheduled_date);

CREATE TABLE public.weekly_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    week_start_date DATE, 
    status VARCHAR(50) DEFAULT 'PLANNING', 
    target_week_number INT CHECK (target_week_number BETWEEN 1 AND 16),
    priority_weight DECIMAL(5,2) DEFAULT 1.00
);

-- Append-Only Log Table
CREATE TABLE public.task_completion_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    completion_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status task_status_enum NOT NULL,
    time_spent_minutes SMALLINT CHECK (time_spent_minutes >= 0),
    notes TEXT
);

CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Data integrity violation: Modifications to the append-only log table are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_append_only
BEFORE UPDATE OR DELETE ON public.task_completion_logs
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ==============================================================================
-- 3. Scheduling (Prisma Parity)
-- ==============================================================================

CREATE TABLE public.fixed_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    rrule TEXT,
    start_time TIME NOT NULL,
    duration_mins INT NOT NULL
);

CREATE TYPE anchor_type_enum AS ENUM ('PRE_EVENT', 'POST_EVENT', 'INDEPENDENT');

CREATE TABLE public.floating_routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    anchor_type anchor_type_enum NOT NULL,
    anchor_id UUID REFERENCES public.fixed_commitments(id) ON DELETE CASCADE,
    duration_mins INT NOT NULL,
    daily_count INT
);

CREATE TABLE public.micro_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.weekly_goals(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL, 
    title VARCHAR(255) NOT NULL,
    estimated_mins INT NOT NULL,
    priority INT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING'
);

CREATE TYPE block_type_enum AS ENUM ('STUDY', 'FIXED_COMMITMENT', 'ROUTINE', 'DEFERRED_FLAG');

CREATE TABLE public.materialized_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.micro_tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    block_type block_type_enum NOT NULL
);

CREATE TABLE public.user_configs (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    timezone VARCHAR(100) NOT NULL,
    sleep_start TIME NOT NULL,
    sleep_end TIME NOT NULL,
    no_study_days INT[]
);

-- ==============================================================================
-- 4. Resources & Documents
-- ==============================================================================

CREATE TABLE public.document_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    bucket_path TEXT NOT NULL,
    document_type VARCHAR(50) CHECK (document_type IN ('syllabus', 'lecture_notes', 'lab_manual', 'handout')),
    semester_tag VARCHAR(50),
    upload_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    type VARCHAR NOT NULL
);

-- ==============================================================================
-- 5. Communication & Integrations
-- ==============================================================================

CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL
);

CREATE TABLE public.chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subtopic_node_id UUID NOT NULL REFERENCES public.course_tree(node_id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]'::jsonb,
    gemini_file_uri TEXT,
    file_uri_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.checkpoint_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_week INT NOT NULL,
    report_markdown TEXT NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- Functions (RPCs)
-- ==============================================================================

CREATE OR REPLACE FUNCTION calculate_subject_prep_score(p_user_id UUID, p_subject_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    prep_score NUMERIC;
BEGIN
    WITH latest_task_states AS (
        SELECT DISTINCT ON (task_id) 
            task_id,
            status
        FROM task_completion_logs
        WHERE user_id = p_user_id 
          AND subject_id = p_subject_id
        ORDER BY task_id, completion_timestamp DESC
    ),
    subject_totals AS (
        SELECT COUNT(*) as total_tasks 
        FROM tasks WHERE user_id = p_user_id AND subject_id = p_subject_id
    )
    SELECT 
        CASE 
            WHEN st.total_tasks = 0 THEN 0.0 
            ELSE (
                SUM(
                    CASE 
                        WHEN lts.status = 'completed' THEN 1.0 
                        WHEN lts.status = 'partial' THEN 0.5 
                        ELSE 0.0 
                    END
                ) / st.total_tasks
            ) * 100.0 
        END INTO prep_score
    FROM latest_task_states lts
    CROSS JOIN subject_totals st
    GROUP BY st.total_tasks;

    RETURN COALESCE(prep_score, 0.0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_overall_preparation(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total_tasks INT;
    completed_score NUMERIC;
BEGIN
    SELECT COUNT(*) INTO total_tasks FROM tasks WHERE user_id = p_user_id;
    
    IF total_tasks = 0 THEN RETURN 0.0; END IF;

    SELECT SUM(CASE WHEN status = 'completed' THEN 1.0 WHEN status = 'partial' THEN 0.5 ELSE 0.0 END)
    INTO completed_score
    FROM tasks WHERE user_id = p_user_id;

    RETURN (completed_score / total_tasks) * 100.0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_subject_coverage(p_user_id UUID, p_subject_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN calculate_subject_prep_score(p_user_id, p_subject_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_lagging_topics(p_user_id UUID)
RETURNS TABLE (topic_name VARCHAR, subject_name VARCHAR, delay_days INT) AS $$
BEGIN
    RETURN QUERY
    SELECT t.name::VARCHAR, s.name::VARCHAR, (CURRENT_DATE - ts.scheduled_date)::INT as delay_days
    FROM tasks ts
    JOIN topics t ON ts.topic_id = t.id
    JOIN subjects s ON ts.subject_id = s.id
    WHERE ts.user_id = p_user_id AND ts.status = 'pending' AND ts.scheduled_date < CURRENT_DATE
    ORDER BY delay_days DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;
