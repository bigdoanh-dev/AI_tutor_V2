ALTER TABLE chat_messages ADD COLUMN sequence bigserial NOT NULL UNIQUE;
CREATE INDEX chat_message_order ON chat_messages(conversation_id,sequence);
