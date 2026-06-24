CREATE TABLE "energy_performance_indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL DEFAULT 1,
	"unit_id" integer,
	"seu_assessment_item_id" integer,
	"name" text NOT NULL,
	"energy_source_id" integer,
	"energy_use_group_id" integer,
	"meter_id" integer,
	"indicator_type" text NOT NULL DEFAULT 'consumption',
	"formula_type" text NOT NULL DEFAULT 'absolute',
	"unit" text,
	"description" text,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL DEFAULT 1,
	"unit_id" integer,
	"seu_assessment_item_id" integer,
	"enpi_id" integer,
	"baseline_year" integer NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"model_type" text NOT NULL DEFAULT 'linear',
	"intercept" real,
	"r_squared" real,
	"adjusted_r_squared" real,
	"is_valid" boolean NOT NULL DEFAULT false,
	"status" text NOT NULL DEFAULT 'draft',
	"update_reason" text,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_baseline_variables" (
	"id" serial PRIMARY KEY NOT NULL,
	"baseline_id" integer NOT NULL,
	"variable_id" integer,
	"variable_name" text NOT NULL,
	"variable_source" text NOT NULL DEFAULT 'manual',
	"coefficient" real,
	"p_value" real,
	"is_significant" boolean NOT NULL DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_performance_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL DEFAULT 1,
	"unit_id" integer,
	"seu_assessment_item_id" integer,
	"enpi_id" integer,
	"baseline_id" integer,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"actual_consumption" real,
	"expected_consumption" real,
	"difference" real,
	"cusum" real,
	"eei" real,
	"set_value" real,
	"status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_seu_assessment_item_id_seu_assessment_items_id_fk" FOREIGN KEY ("seu_assessment_item_id") REFERENCES "public"."seu_assessment_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_energy_source_id_energy_sources_id_fk" FOREIGN KEY ("energy_source_id") REFERENCES "public"."energy_sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_energy_use_group_id_energy_use_groups_id_fk" FOREIGN KEY ("energy_use_group_id") REFERENCES "public"."energy_use_groups"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_indicators" ADD CONSTRAINT "energy_performance_indicators_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baselines" ADD CONSTRAINT "energy_baselines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baselines" ADD CONSTRAINT "energy_baselines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baselines" ADD CONSTRAINT "energy_baselines_seu_assessment_item_id_seu_assessment_items_id_fk" FOREIGN KEY ("seu_assessment_item_id") REFERENCES "public"."seu_assessment_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baselines" ADD CONSTRAINT "energy_baselines_enpi_id_energy_performance_indicators_id_fk" FOREIGN KEY ("enpi_id") REFERENCES "public"."energy_performance_indicators"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baselines" ADD CONSTRAINT "energy_baselines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baseline_variables" ADD CONSTRAINT "energy_baseline_variables_baseline_id_energy_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."energy_baselines"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_baseline_variables" ADD CONSTRAINT "energy_baseline_variables_variable_id_variables_id_fk" FOREIGN KEY ("variable_id") REFERENCES "public"."variables"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_results" ADD CONSTRAINT "energy_performance_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_results" ADD CONSTRAINT "energy_performance_results_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_results" ADD CONSTRAINT "energy_performance_results_seu_assessment_item_id_seu_assessment_items_id_fk" FOREIGN KEY ("seu_assessment_item_id") REFERENCES "public"."seu_assessment_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_results" ADD CONSTRAINT "energy_performance_results_enpi_id_energy_performance_indicators_id_fk" FOREIGN KEY ("enpi_id") REFERENCES "public"."energy_performance_indicators"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "energy_performance_results" ADD CONSTRAINT "energy_performance_results_baseline_id_energy_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."energy_baselines"("id") ON DELETE set null ON UPDATE no action;
