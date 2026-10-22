CREATE TABLE "sports_member_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"actor_id" uuid,
	"request_id" uuid NOT NULL,
	"credits_before" integer NOT NULL,
	"credits_after" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sports_member_resets" ADD CONSTRAINT "sports_member_resets_member_id_sports_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."sports_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_member_resets" ADD CONSTRAINT "sports_member_resets_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sports_member_resets_request_idx" ON "sports_member_resets" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "sports_member_resets_member_idx" ON "sports_member_resets" USING btree ("member_id");