UPDATE "agents"
SET
	"share_token" = encode(gen_random_bytes(32), 'hex'),
	"updated_at" = now()
WHERE
	"status" = 'live'
	AND "share_token" IS NULL
	AND "deleted_at" IS NULL;
