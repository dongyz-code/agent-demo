CREATE TABLE "ai_app" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"desc" text,
	"available" boolean NOT NULL,
	"deploy_hash" bytea,
	"create_user_id" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL,
	"last_update_user_id" varchar(255) NOT NULL,
	"last_update_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_app_version" (
	"id" uuid NOT NULL,
	"hash" bytea PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"size" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(255) NOT NULL,
	"client_id" uuid,
	"client_mark" varchar(255),
	"url" text,
	"status" varchar(255),
	"ip" varchar(255),
	"user_id" uuid,
	"search_key" text,
	"detail" text,
	"start_timestamp" timestamp (6) with time zone NOT NULL,
	"end_timestamp" timestamp (6) with time zone,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"desc" text,
	"available" boolean NOT NULL,
	"client_id" uuid NOT NULL,
	"client_secret" varchar(255) NOT NULL,
	"last_login_timestamp" timestamp (6) with time zone,
	"create_user_id" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL,
	"last_update_user_id" varchar(255) NOT NULL,
	"last_update_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"role_id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"desc" text,
	"available" boolean NOT NULL,
	"permission" text,
	"create_user_id" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL,
	"last_update_user_id" varchar(255) NOT NULL,
	"last_update_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sys_conf" (
	"id" smallint PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"last_update_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"task_key" varchar(255) NOT NULL,
	"task_name" text,
	"search_key" text,
	"pending_uuid" varchar(255),
	"args" text,
	"status" varchar(255) NOT NULL,
	"execution_user_id" uuid,
	"trigger_method" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL,
	"start_timestamp" timestamp (6) with time zone,
	"end_timestamp" timestamp (6) with time zone,
	"logs" bytea,
	"last_update_timestamp" timestamp (6) with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(255) NOT NULL,
	"password" varchar(255),
	"nickname" varchar(255) NOT NULL,
	"email" varchar(255),
	"available" boolean NOT NULL,
	"last_login_timestamp" timestamp (6) with time zone,
	"extra" text,
	"create_user_id" varchar(255) NOT NULL,
	"create_timestamp" timestamp (6) with time zone NOT NULL,
	"last_update_user_id" varchar(255) NOT NULL,
	"last_update_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"key" varchar(255) NOT NULL,
	"ip" varchar(255) NOT NULL,
	"search_key" text,
	"detail" text,
	"timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_update_user_id" varchar(255) NOT NULL,
	"last_update_timestamp" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_app_domain_unique" ON "ai_app" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "ai_app_available_idx" ON "ai_app" USING btree ("available");--> statement-breakpoint
CREATE INDEX "ai_app_version_id_idx" ON "ai_app_version" USING btree ("id");--> statement-breakpoint
CREATE INDEX "api_logs_mode_idx" ON "api_logs" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "api_logs_client_id_idx" ON "api_logs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "api_logs_client_mark_idx" ON "api_logs" USING btree ("client_mark");--> statement-breakpoint
CREATE INDEX "api_logs_url_idx" ON "api_logs" USING btree ("url");--> statement-breakpoint
CREATE INDEX "api_logs_status_idx" ON "api_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "api_logs_ip_idx" ON "api_logs" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "api_logs_user_id_idx" ON "api_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apps_client_id_idx" ON "apps" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tasks_task_key_idx" ON "tasks" USING btree ("task_key");--> statement-breakpoint
CREATE INDEX "tasks_pending_uuid_idx" ON "tasks" USING btree ("pending_uuid");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_trigger_method_idx" ON "tasks" USING btree ("trigger_method");--> statement-breakpoint
CREATE INDEX "tasks_create_timestamp_idx" ON "tasks" USING btree ("create_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_unique" ON "user" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_logs_user_id_idx" ON "user_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_logs_key_idx" ON "user_logs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "user_logs_ip_idx" ON "user_logs" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "user_role_role_id_idx" ON "user_role" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_role_user_id_idx" ON "user_role" USING btree ("user_id");--> statement-breakpoint
COMMENT ON TABLE "sys_conf" IS '系统配置';--> statement-breakpoint
COMMENT ON COLUMN "sys_conf"."id" IS '配置ID';--> statement-breakpoint
COMMENT ON COLUMN "sys_conf"."data" IS '系统配置';--> statement-breakpoint
COMMENT ON COLUMN "sys_conf"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "user" IS '用户表';--> statement-breakpoint
COMMENT ON COLUMN "user"."user_id" IS '用户ID';--> statement-breakpoint
COMMENT ON COLUMN "user"."username" IS '用户名';--> statement-breakpoint
COMMENT ON COLUMN "user"."password" IS '密码';--> statement-breakpoint
COMMENT ON COLUMN "user"."nickname" IS '用户昵称';--> statement-breakpoint
COMMENT ON COLUMN "user"."email" IS '用户邮箱';--> statement-breakpoint
COMMENT ON COLUMN "user"."available" IS '是否启用';--> statement-breakpoint
COMMENT ON COLUMN "user"."last_login_timestamp" IS '最后登录时间';--> statement-breakpoint
COMMENT ON COLUMN "user"."extra" IS '额外信息';--> statement-breakpoint
COMMENT ON COLUMN "user"."create_user_id" IS '创建用户ID';--> statement-breakpoint
COMMENT ON COLUMN "user"."create_timestamp" IS '创建时间';--> statement-breakpoint
COMMENT ON COLUMN "user"."last_update_user_id" IS '最近更新用户ID';--> statement-breakpoint
COMMENT ON COLUMN "user"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "role" IS '角色表';--> statement-breakpoint
COMMENT ON COLUMN "role"."role_id" IS '角色ID';--> statement-breakpoint
COMMENT ON COLUMN "role"."name" IS '角色名称';--> statement-breakpoint
COMMENT ON COLUMN "role"."desc" IS '角色描述';--> statement-breakpoint
COMMENT ON COLUMN "role"."available" IS '是否可用';--> statement-breakpoint
COMMENT ON COLUMN "role"."permission" IS '权限';--> statement-breakpoint
COMMENT ON COLUMN "role"."create_user_id" IS '创建用户ID';--> statement-breakpoint
COMMENT ON COLUMN "role"."create_timestamp" IS '创建时间';--> statement-breakpoint
COMMENT ON COLUMN "role"."last_update_user_id" IS '最近更新用户ID';--> statement-breakpoint
COMMENT ON COLUMN "role"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "user_role" IS '用户-角色对应关系';--> statement-breakpoint
COMMENT ON COLUMN "user_role"."role_id" IS '角色ID';--> statement-breakpoint
COMMENT ON COLUMN "user_role"."user_id" IS '用户ID';--> statement-breakpoint
COMMENT ON COLUMN "user_role"."last_update_user_id" IS '最近更新用户ID';--> statement-breakpoint
COMMENT ON COLUMN "user_role"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "apps" IS '接口列表';--> statement-breakpoint
COMMENT ON COLUMN "apps"."id" IS '应用ID';--> statement-breakpoint
COMMENT ON COLUMN "apps"."name" IS '应用名称';--> statement-breakpoint
COMMENT ON COLUMN "apps"."desc" IS '应用简介';--> statement-breakpoint
COMMENT ON COLUMN "apps"."available" IS '是否启用';--> statement-breakpoint
COMMENT ON COLUMN "apps"."client_id" IS '客户端ID';--> statement-breakpoint
COMMENT ON COLUMN "apps"."client_secret" IS '客户端密钥';--> statement-breakpoint
COMMENT ON COLUMN "apps"."last_login_timestamp" IS '最后登录时间';--> statement-breakpoint
COMMENT ON COLUMN "apps"."create_user_id" IS '创建用户ID';--> statement-breakpoint
COMMENT ON COLUMN "apps"."create_timestamp" IS '创建时间';--> statement-breakpoint
COMMENT ON COLUMN "apps"."last_update_user_id" IS '最近更新用户ID';--> statement-breakpoint
COMMENT ON COLUMN "apps"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "tasks" IS '任务列表';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."task_id" IS '任务ID';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."task_key" IS '任务标识，分类';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."task_name" IS '可以为空，默认就是 task_key，也可根据 detail 自行生成';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."search_key" IS '用于快速检索的 KEY';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."pending_uuid" IS '运行中任务唯一标识，用于避免重复执行同 pending_uuid 任务';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."args" IS '参数列表';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."status" IS '任务状态：待开始、进行中、完成、失败、删除、主动停止';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."execution_user_id" IS '执行用户或添加任务的用户，自动任务可为空';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."trigger_method" IS '任务触发方式：手动或自动';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."create_timestamp" IS '添加任务到队列的时间';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."start_timestamp" IS '开始执行任务的时间';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."end_timestamp" IS '任务结束的时间';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."logs" IS '任务执行日志，按行写入，gz 压缩';--> statement-breakpoint
COMMENT ON COLUMN "tasks"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "api_logs" IS 'API 调用日志';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."id" IS '唯一ID';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."mode" IS 'API 调用模式：主动发起或被动接收';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."client_id" IS '应用ID，被动发起才有值';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."client_mark" IS '通信标识，表示和哪个系统交互，主动发起才有值';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."url" IS '请求URL';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."status" IS '操作结果';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."ip" IS '主动发起记录 localhost 或发起人 IP，被动接收记录 IP';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."user_id" IS '主动请求关联的用户ID';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."search_key" IS '用于快速检索的 KEY（ID）';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."detail" IS '操作详情';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."start_timestamp" IS '操作开始时间';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."end_timestamp" IS '操作结束时间';--> statement-breakpoint
COMMENT ON COLUMN "api_logs"."duration" IS '响应时间，毫秒单位';--> statement-breakpoint
COMMENT ON TABLE "user_logs" IS '用户操作日志';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."id" IS '日志ID';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."user_id" IS '用户ID';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."key" IS '操作类型';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."ip" IS 'IP地址';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."search_key" IS '用于快速检索的 KEY（ID）';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."detail" IS '操作详情';--> statement-breakpoint
COMMENT ON COLUMN "user_logs"."timestamp" IS '操作时间';--> statement-breakpoint
COMMENT ON TABLE "ai_app" IS 'AI 应用';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."id" IS '应用ID';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."domain" IS '应用域名';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."name" IS '应用名称';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."desc" IS '应用简介';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."available" IS '是否启用';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."deploy_hash" IS '版本哈希值，对应上传的 ZIP 文件 sha256 值';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."create_user_id" IS '创建用户ID';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."create_timestamp" IS '创建时间';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."last_update_user_id" IS '最近更新用户ID';--> statement-breakpoint
COMMENT ON COLUMN "ai_app"."last_update_timestamp" IS '最近更新时间';--> statement-breakpoint
COMMENT ON TABLE "ai_app_version" IS 'AI 应用版本';--> statement-breakpoint
COMMENT ON COLUMN "ai_app_version"."id" IS '应用ID';--> statement-breakpoint
COMMENT ON COLUMN "ai_app_version"."hash" IS '版本哈希值，对应上传的 ZIP 文件 sha256 值';--> statement-breakpoint
COMMENT ON COLUMN "ai_app_version"."name" IS '版本名称';--> statement-breakpoint
COMMENT ON COLUMN "ai_app_version"."size" IS '版本大小，单位：bytes';--> statement-breakpoint
COMMENT ON COLUMN "ai_app_version"."create_timestamp" IS '版本创建时间';
