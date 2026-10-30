CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 name text NOT NULL, verified boolean NOT NULL DEFAULT false, logging boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE auth_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('verify','reset')), expires_at timestamptz NOT NULL
);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE courses (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE bank_releases (
 id uuid PRIMARY KEY, course_id text NOT NULL REFERENCES courses(id), version text NOT NULL,
 content_hash text NOT NULL, data jsonb NOT NULL, demo boolean NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(), UNIQUE(course_id,version)
);
CREATE INDEX bank_latest ON bank_releases(course_id,published_at DESC);
CREATE TABLE material_states (
 user_id uuid NOT NULL REFERENCES users(id), course_id text NOT NULL REFERENCES courses(id),
 material_id text NOT NULL, saved boolean NOT NULL DEFAULT false, read boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,course_id,material_id)
);
CREATE TABLE weekly_templates (
 id uuid PRIMARY KEY, course_id text NOT NULL REFERENCES courses(id), week text NOT NULL,
 topic text NOT NULL, requested_count integer NOT NULL, release_id uuid NOT NULL REFERENCES bank_releases(id),
 question_ids jsonb NOT NULL, UNIQUE(course_id,week,topic,requested_count)
);
CREATE TABLE attempts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), course_id text NOT NULL REFERENCES courses(id),
 release_id uuid NOT NULL REFERENCES bank_releases(id), template_id uuid REFERENCES weekly_templates(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','submitted','abandoned')),
 mode text NOT NULL CHECK(mode IN ('adaptive','fixed')), algorithm_version text NOT NULL,
 revision integer NOT NULL DEFAULT 1, request_id uuid NOT NULL, data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
 heartbeat_at timestamptz, UNIQUE(user_id,request_id)
);
CREATE UNIQUE INDEX one_active_attempt ON attempts(user_id,course_id) WHERE status='active';
CREATE INDEX attempts_history ON attempts(user_id,course_id,created_at);
CREATE TABLE attempt_commands (
 attempt_id uuid NOT NULL REFERENCES attempts(id), request_id uuid NOT NULL, body_hash text NOT NULL,
 PRIMARY KEY(attempt_id,request_id)
);
CREATE TABLE study_plans (
 user_id uuid NOT NULL REFERENCES users(id), course_id text NOT NULL REFERENCES courses(id),
 revision integer NOT NULL DEFAULT 1, data jsonb NOT NULL, PRIMARY KEY(user_id,course_id)
);
CREATE TABLE notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), course_id text NOT NULL REFERENCES courses(id),
 occurrence_key text NOT NULL UNIQUE, title text NOT NULL, body text NOT NULL, due_at timestamptz NOT NULL,
 plan_revision integer NOT NULL, read_at timestamptz, email_status text NOT NULL DEFAULT 'pending',
 email_attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_user ON notifications(user_id,created_at DESC);
CREATE TABLE events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), course_id text NOT NULL REFERENCES courses(id),
 attempt_id uuid REFERENCES attempts(id), type text NOT NULL, data jsonb NOT NULL,
 operational boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_user ON events(user_id,created_at);
CREATE TABLE conversations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), course_id text NOT NULL REFERENCES courses(id),
 title text NOT NULL, context jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chat_messages (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id), role text NOT NULL,
 text text NOT NULL, sources jsonb NOT NULL DEFAULT '[]', model text, usage jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_history ON chat_messages(conversation_id,created_at);
CREATE TABLE chat_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), conversation_id uuid NOT NULL REFERENCES conversations(id),
 status text NOT NULL CHECK(status IN ('processing','complete','failed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_chunks (
 id uuid PRIMARY KEY, release_id uuid NOT NULL REFERENCES bank_releases(id), course_id text NOT NULL REFERENCES courses(id),
 material_id text NOT NULL, source jsonb NOT NULL, content text NOT NULL,
 model text NOT NULL, index_version text NOT NULL, embedding vector(1536) NOT NULL
);
CREATE INDEX chunks_release ON document_chunks(release_id,model,index_version);
CREATE INDEX chunk_vectors ON document_chunks USING hnsw(embedding vector_cosine_ops);
CREATE TABLE mail_outbox (
 id uuid PRIMARY KEY, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
 notification_id uuid REFERENCES notifications(id), status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE UNIQUE INDEX one_notification_mail ON mail_outbox(notification_id) WHERE notification_id IS NOT NULL;
