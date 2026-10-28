-- Runs once on first Postgres start. n8n uses the "n8n" database;
-- the processed email log lives in its own database.
CREATE DATABASE sales_assistant;

\connect sales_assistant

-- Deliberately no email body or subject: logs must not contain email content.
CREATE TABLE processed_emails (
    id              SERIAL PRIMARY KEY,
    message_id      TEXT NOT NULL UNIQUE,  -- Gmail message ID, makes processing idempotent
    category        TEXT,                  -- order | inquiry | complaint | other
    status          TEXT NOT NULL,         -- offer_drafted | manual_review | complaint_logged | ignored | failed
    flagged         BOOLEAN NOT NULL DEFAULT FALSE,
    guard_codes     TEXT[] NOT NULL DEFAULT '{}',
    sf_opportunity_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
