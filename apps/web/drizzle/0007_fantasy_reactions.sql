CREATE TABLE "fantasy_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_reactions" ADD CONSTRAINT "fantasy_reactions_from_member_id_fantasy_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_reactions" ADD CONSTRAINT "fantasy_reactions_to_member_id_fantasy_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_reactions_unique_idx" ON "fantasy_reactions" USING btree ("from_member_id","to_member_id","emoji");--> statement-breakpoint
CREATE INDEX "fantasy_reactions_target_idx" ON "fantasy_reactions" USING btree ("to_member_id");