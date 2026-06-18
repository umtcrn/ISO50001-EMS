CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subdomain" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
-- Varsayılan firma kaydını ekle; tüm mevcut satırlar company_id=1 alacak
INSERT INTO "companies" ("id", "name", "subdomain", "is_active")
VALUES (1, 'Varsayılan Firma', 'default', true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "consumption" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "energy_sources" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "energy_targets" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seu_items" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_units" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "swot_items" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "weather" ADD COLUMN "company_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_sources" ADD CONSTRAINT "energy_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_targets" ADD CONSTRAINT "energy_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seu_items" ADD CONSTRAINT "seu_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_units" ADD CONSTRAINT "sub_units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swot_items" ADD CONSTRAINT "swot_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather" ADD CONSTRAINT "weather_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
