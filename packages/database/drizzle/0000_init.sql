CREATE TABLE "instruments" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"asset_class" varchar(16) NOT NULL,
	"sector" varchar(32),
	"tradable" boolean NOT NULL,
	"source" varchar(16) NOT NULL,
	"source_ref" text,
	"proxy_for" varchar(32),
	CONSTRAINT "instruments_asset_class_check" CHECK ("instruments"."asset_class" in ('equity', 'etf', 'commodity')),
	CONSTRAINT "instruments_source_check" CHECK ("instruments"."source" in ('tiingo', 'fred'))
);
--> statement-breakpoint
CREATE TABLE "price_bars" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"adj_close" double precision NOT NULL,
	"volume" bigint,
	CONSTRAINT "price_bars_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE TABLE "macro_observations" (
	"series_id" text NOT NULL,
	"date" date NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "macro_observations_series_id_date_pk" PRIMARY KEY("series_id","date")
);
--> statement-breakpoint
CREATE TABLE "market_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(32) NOT NULL,
	"subtype" varchar(32),
	"title" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"article_count" integer NOT NULL,
	"domain_count" integer NOT NULL,
	"cluster_z" real,
	"gdelt_query" text NOT NULL,
	"vol_z" real,
	"tone_z" real,
	"entities" text[] DEFAULT '{}'::text[] NOT NULL,
	"factor_directions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"top_news_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "market_events_type_check" CHECK ("market_events"."type" in ('geopolitical', 'policy', 'macro', 'statement', 'accident', 'disaster', 'corporate', 'supply_shock')),
	CONSTRAINT "market_events_status_check" CHECK ("market_events"."status" in ('active', 'faded'))
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(16) NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"domain" text,
	"query_key" varchar(64),
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone,
	"prefilter_match" boolean NOT NULL,
	"tickers" text[] DEFAULT '{}'::text[] NOT NULL,
	"peer_tickers" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_sentiment" real,
	"ticker_sentiment" jsonb,
	"sentiment" real,
	"relevance" real,
	"event_type" varchar(32),
	"entity_sentiment" jsonb,
	"factor_directions" jsonb,
	"market_event_id" uuid,
	"scored_at" timestamp with time zone,
	"score_model" varchar(64),
	CONSTRAINT "news_items_url_unique" UNIQUE("url"),
	CONSTRAINT "news_items_source_check" CHECK ("news_items"."source" in ('gdelt', 'alphavantage')),
	CONSTRAINT "news_items_event_type_check" CHECK ("news_items"."event_type" in ('geopolitical', 'policy', 'macro', 'statement', 'accident', 'disaster', 'corporate', 'supply_shock', 'none')),
	CONSTRAINT "news_items_sentiment_check" CHECK ("news_items"."sentiment" between -1 and 1),
	CONSTRAINT "news_items_relevance_check" CHECK ("news_items"."relevance" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "storms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season" integer NOT NULL,
	"source" varchar(16) NOT NULL,
	CONSTRAINT "storms_source_check" CHECK ("storms"."source" in ('hurdat2', 'nhc'))
);
--> statement-breakpoint
CREATE TABLE "storm_points" (
	"storm_id" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"valid_at" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"wind_kt" integer NOT NULL,
	"pressure_mb" integer,
	"status" varchar(8),
	"record_id" varchar(4),
	CONSTRAINT "storm_points_storm_id_kind_issued_at_valid_at_pk" PRIMARY KEY("storm_id","kind","issued_at","valid_at"),
	CONSTRAINT "storm_points_kind_check" CHECK ("storm_points"."kind" in ('observed', 'forecast'))
);
--> statement-breakpoint
CREATE TABLE "refineries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"ticker" text,
	"state" text NOT NULL,
	"padd" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"capacity_bpd" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analog_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" varchar(32) NOT NULL,
	"subtype" varchar(32),
	"name" text NOT NULL,
	"storm_id" text,
	"first_report_at" timestamp with time zone NOT NULL,
	"feature_at" timestamp with time zone NOT NULL,
	"t0" date NOT NULL,
	"landfall_at" timestamp with time zone,
	"region" varchar(64),
	"entities" text[] DEFAULT '{}'::text[] NOT NULL,
	"affected_sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"gdelt_query" text NOT NULL,
	"features" jsonb NOT NULL,
	"company_cap_at_risk" jsonb,
	"reactions" jsonb NOT NULL,
	"realized_until" date NOT NULL,
	"outage_days" real,
	"description" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "analog_events_type_check" CHECK ("analog_events"."type" in ('geopolitical', 'policy', 'macro', 'statement', 'accident', 'disaster', 'corporate', 'supply_shock'))
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nav" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolios_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"target_weight" double precision NOT NULL,
	CONSTRAINT "positions_portfolio_id_symbol_pk" PRIMARY KEY("portfolio_id","symbol"),
	CONSTRAINT "positions_target_weight_check" CHECK ("positions"."target_weight" <> 0)
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"query" text NOT NULL,
	"mode" varchar(16) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"replay_event_id" text,
	"market_event_id" uuid,
	"status" varchar(16) NOT NULL,
	"plan" jsonb,
	"event_profile" jsonb,
	"answer" jsonb,
	"hedge_plan" jsonb,
	"risk" jsonb,
	"forecast" jsonb,
	"verification" jsonb,
	"confidence" varchar(8),
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "runs_query_length_check" CHECK (char_length("runs"."query") <= 500),
	CONSTRAINT "runs_mode_check" CHECK ("runs"."mode" in ('live', 'replay')),
	CONSTRAINT "runs_status_check" CHECK ("runs"."status" in ('running', 'succeeded', 'partial', 'failed')),
	CONSTRAINT "runs_confidence_check" CHECK ("runs"."confidence" in ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"node" varchar(32),
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_events_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"run_id" uuid NOT NULL,
	"key" varchar(16) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"label" text NOT NULL,
	"value" double precision,
	"text_value" text,
	"unit" varchar(16),
	"basis" varchar(16) NOT NULL,
	"source" varchar(64) NOT NULL,
	"source_ref" text,
	"as_of" timestamp with time zone,
	"stale" boolean DEFAULT false NOT NULL,
	"produced_by" varchar(32) NOT NULL,
	"payload" jsonb,
	CONSTRAINT "evidence_run_id_key_pk" PRIMARY KEY("run_id","key"),
	CONSTRAINT "evidence_basis_check" CHECK ("evidence"."basis" in ('observed', 'computed', 'model', 'assumption'))
);
--> statement-breakpoint
CREATE TABLE "backtests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"config" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"predictions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"run_id" uuid,
	"symbol" text NOT NULL,
	"side" varchar(8) NOT NULL,
	"quantity" integer NOT NULL,
	"price" double precision NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_side_check" CHECK ("trades"."side" in ('buy', 'sell')),
	CONSTRAINT "trades_quantity_check" CHECK ("trades"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "price_bars" ADD CONSTRAINT "price_bars_symbol_instruments_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."instruments"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_market_event_id_market_events_id_fk" FOREIGN KEY ("market_event_id") REFERENCES "public"."market_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storm_points" ADD CONSTRAINT "storm_points_storm_id_storms_id_fk" FOREIGN KEY ("storm_id") REFERENCES "public"."storms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analog_events" ADD CONSTRAINT "analog_events_storm_id_storms_id_fk" FOREIGN KEY ("storm_id") REFERENCES "public"."storms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_symbol_instruments_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."instruments"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_replay_event_id_analog_events_id_fk" FOREIGN KEY ("replay_event_id") REFERENCES "public"."analog_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_market_event_id_market_events_id_fk" FOREIGN KEY ("market_event_id") REFERENCES "public"."market_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_symbol_instruments_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."instruments"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_events_first_seen_idx" ON "market_events" USING btree ("first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_items_published_idx" ON "news_items" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_items_event_type_published_idx" ON "news_items" USING btree ("event_type","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "storm_points_valid_at_idx" ON "storm_points" USING btree ("valid_at");--> statement-breakpoint
CREATE INDEX "analog_events_realized_until_idx" ON "analog_events" USING btree ("realized_until");--> statement-breakpoint
CREATE INDEX "runs_thread_started_idx" ON "runs" USING btree ("thread_id","started_at");