CREATE TABLE "table_structure_ops" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"type" varchar(255) NOT NULL,
	"status" varchar(255) NOT NULL,
	"table_key" varchar(255) NOT NULL,
	"table_schema" varchar(255) NOT NULL,
	"target_table_name" varchar(255) NOT NULL,
	"source_table_name" varchar(255) NOT NULL,
	"plan" text NOT NULL,
	"sql_preview" text NOT NULL,
	"warnings" text,
	"blockers" text,
	"backup_table_name" varchar(255),
	"error" text,
	"create_user_id" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL,
	"expire_timestamp" timestamp (6) with time zone NOT NULL,
	"apply_user_id" varchar(255),
	"start_timestamp" timestamp (6) with time zone,
	"end_timestamp" timestamp (6) with time zone
);
--> statement-breakpoint
CREATE INDEX "table_structure_ops_type_idx" ON "table_structure_ops" USING btree ("type");--> statement-breakpoint
CREATE INDEX "table_structure_ops_status_idx" ON "table_structure_ops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "table_structure_ops_table_key_idx" ON "table_structure_ops" USING btree ("table_key");--> statement-breakpoint
CREATE INDEX "table_structure_ops_create_timestamp_idx" ON "table_structure_ops" USING btree ("create_timestamp");