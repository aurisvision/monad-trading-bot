--
-- PostgreSQL database dump
--

\restrict JO38L8S6epRTB7wckO48y5EaHV4hANww5OTsFMjAMcMSvRfxE3CZJc218ltPy3o

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: update_code_usage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_code_usage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only increment if this is a new active access (not an update)
    IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
        UPDATE access_codes 
        SET used_count = used_count + 1 
        WHERE code = NEW.used_code;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: update_feedback_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_feedback_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_codes (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    code_type character varying(20) DEFAULT 'general'::character varying NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp without time zone,
    description text,
    created_by bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    disabled_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_expires_future CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
    CONSTRAINT chk_max_uses_positive CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT chk_used_count_positive CHECK ((used_count >= 0))
);


--
-- Name: access_codes_backup_20251011_132039; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_codes_backup_20251011_132039 (
    id integer,
    code character varying(20),
    used_by bigint,
    used_at timestamp without time zone,
    created_at timestamp without time zone,
    code_type character varying(50),
    expires_at timestamp with time zone,
    created_by integer,
    is_active boolean
);


--
-- Name: access_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.access_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: access_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.access_codes_id_seq OWNED BY public.access_codes.id;


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    username character varying(255),
    first_name character varying(255),
    feedback_type character varying(50) NOT NULL,
    feedback_text text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'new'::character varying,
    admin_notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT feedback_feedback_type_check CHECK (((feedback_type)::text = ANY ((ARRAY['bug'::character varying, 'suggestion'::character varying, 'general'::character varying])::text[]))),
    CONSTRAINT feedback_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'reviewed'::character varying, 'resolved'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: TABLE feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feedback IS 'Stores user feedback including bug reports, suggestions, and general feedback';


--
-- Name: COLUMN feedback.feedback_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feedback.feedback_type IS 'Type of feedback: bug, suggestion, or general';


--
-- Name: COLUMN feedback.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feedback.status IS 'Processing status: new, reviewed, resolved, or archived';


--
-- Name: COLUMN feedback.admin_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feedback.admin_notes IS 'Internal notes for admin use';


--
-- Name: feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_id_seq OWNED BY public.feedback.id;


--
-- Name: performance_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_metrics (
    id integer NOT NULL,
    metric_name character varying(255) NOT NULL,
    metric_value numeric,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    labels jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: performance_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.performance_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: performance_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.performance_metrics_id_seq OWNED BY public.performance_metrics.id;


--
-- Name: portfolio_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_entries (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    token_address character varying(42) NOT NULL,
    token_symbol character varying(20),
    total_bought numeric(36,18) DEFAULT 0,
    total_sold numeric(36,18) DEFAULT 0,
    average_buy_price numeric(36,18) DEFAULT 0,
    current_balance numeric(36,18) DEFAULT 0,
    realized_pnl numeric(36,18) DEFAULT 0,
    unrealized_pnl numeric(36,18) DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: portfolio_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.portfolio_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: portfolio_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.portfolio_entries_id_seq OWNED BY public.portfolio_entries.id;


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    action character varying(50) NOT NULL,
    count integer DEFAULT 1,
    window_start timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rate_limits_id_seq OWNED BY public.rate_limits.id;


--
-- Name: system_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_metrics (
    id bigint NOT NULL,
    metric_name character varying(50) NOT NULL,
    metric_value numeric(20,8) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_metrics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_metrics_id_seq OWNED BY public.system_metrics.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id bigint NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: temp_sell_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.temp_sell_data (
    id character varying(100) NOT NULL,
    telegram_id bigint NOT NULL,
    token_address character varying(42) NOT NULL,
    token_symbol character varying(20),
    amount numeric(36,18) NOT NULL,
    quote_data jsonb,
    expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '00:10:00'::interval),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    tx_hash character varying(66) NOT NULL,
    type character varying(20) NOT NULL,
    token_address character varying(42) NOT NULL,
    token_symbol character varying(20),
    amount numeric(36,18) NOT NULL,
    price_per_token numeric(36,18),
    total_value numeric(36,18) NOT NULL,
    gas_used bigint,
    gas_price bigint,
    status character varying(20) DEFAULT 'pending'::character varying,
    block_number bigint,
    network character varying(20) DEFAULT 'monad'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    confirmed_at timestamp with time zone
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: user_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_access (
    id integer NOT NULL,
    telegram_id bigint NOT NULL,
    used_code character varying(20) NOT NULL,
    access_granted_at timestamp without time zone DEFAULT now() NOT NULL,
    user_info jsonb,
    revoked_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: user_access_backup_20251011_132039; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_access_backup_20251011_132039 (
    id integer,
    telegram_id bigint,
    access_code character varying(50),
    granted_at timestamp with time zone,
    used_at timestamp with time zone,
    is_active boolean,
    used_code text,
    access_granted_at timestamp with time zone
);


--
-- Name: user_access_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_access_id_seq OWNED BY public.user_access.id;


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    gas_price bigint DEFAULT '110000000000'::bigint,
    slippage_tolerance numeric(5,2) DEFAULT 5.0,
    sell_gas_price bigint DEFAULT '110000000000'::bigint,
    sell_slippage_tolerance numeric(5,2) DEFAULT 5.0,
    auto_buy_enabled boolean DEFAULT false,
    auto_buy_amount numeric(10,4) DEFAULT 0.1,
    auto_buy_gas bigint DEFAULT '110000000000'::bigint,
    auto_buy_slippage numeric(5,2) DEFAULT 5.0,
    custom_buy_amounts text DEFAULT '0.1,0.5,1,5'::text,
    custom_sell_percentages text DEFAULT '25,50,75,100'::text,
    turbo_mode boolean DEFAULT false,
    turbo_mode_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    gas_settings_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    slippage_settings_updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_settings_backup_20251019_024911; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings_backup_20251019_024911 (
    id bigint,
    telegram_id bigint,
    gas_price bigint,
    slippage_tolerance numeric(5,2),
    sell_gas_price bigint,
    sell_slippage_tolerance numeric(5,2),
    auto_buy_enabled boolean,
    auto_buy_amount numeric(10,4),
    auto_buy_gas bigint,
    auto_buy_slippage numeric(5,2),
    custom_buy_amounts text,
    custom_sell_percentages text,
    turbo_mode boolean,
    turbo_mode_updated_at timestamp with time zone,
    gas_settings_updated_at timestamp with time zone,
    slippage_settings_updated_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: user_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_settings_id_seq OWNED BY public.user_settings.id;


--
-- Name: user_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_states (
    telegram_id bigint NOT NULL,
    state character varying(50),
    state_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '01:00:00'::interval)
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    username character varying(255),
    wallet_address character varying(42) NOT NULL,
    encrypted_private_key text NOT NULL,
    encrypted_mnemonic text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: access_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes ALTER COLUMN id SET DEFAULT nextval('public.access_codes_id_seq'::regclass);


--
-- Name: feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN id SET DEFAULT nextval('public.feedback_id_seq'::regclass);


--
-- Name: performance_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_metrics ALTER COLUMN id SET DEFAULT nextval('public.performance_metrics_id_seq'::regclass);


--
-- Name: portfolio_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_entries ALTER COLUMN id SET DEFAULT nextval('public.portfolio_entries_id_seq'::regclass);


--
-- Name: rate_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits ALTER COLUMN id SET DEFAULT nextval('public.rate_limits_id_seq'::regclass);


--
-- Name: system_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics ALTER COLUMN id SET DEFAULT nextval('public.system_metrics_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: user_access id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access ALTER COLUMN id SET DEFAULT nextval('public.user_access_id_seq'::regclass);


--
-- Name: user_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings ALTER COLUMN id SET DEFAULT nextval('public.user_settings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: access_codes access_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_code_key UNIQUE (code);


--
-- Name: access_codes access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: performance_metrics performance_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_metrics
    ADD CONSTRAINT performance_metrics_pkey PRIMARY KEY (id);


--
-- Name: portfolio_entries portfolio_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_entries
    ADD CONSTRAINT portfolio_entries_pkey PRIMARY KEY (id);


--
-- Name: portfolio_entries portfolio_entries_telegram_id_token_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_entries
    ADD CONSTRAINT portfolio_entries_telegram_id_token_address_key UNIQUE (telegram_id, token_address);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_telegram_id_action_window_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_telegram_id_action_window_start_key UNIQUE (telegram_id, action, window_start);


--
-- Name: system_metrics system_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics
    ADD CONSTRAINT system_metrics_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: temp_sell_data temp_sell_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temp_sell_data
    ADD CONSTRAINT temp_sell_data_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_access user_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access
    ADD CONSTRAINT user_access_pkey PRIMARY KEY (id);


--
-- Name: user_access user_access_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access
    ADD CONSTRAINT user_access_telegram_id_key UNIQUE (telegram_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_telegram_id_key UNIQUE (telegram_id);


--
-- Name: user_states user_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_states
    ADD CONSTRAINT user_states_pkey PRIMARY KEY (telegram_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);


--
-- Name: idx_access_codes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_codes_active ON public.access_codes USING btree (is_active);


--
-- Name: idx_access_codes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_codes_created_at ON public.access_codes USING btree (created_at);


--
-- Name: idx_access_codes_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_codes_created_by ON public.access_codes USING btree (created_by);


--
-- Name: idx_access_codes_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_codes_expires ON public.access_codes USING btree (expires_at);


--
-- Name: idx_access_codes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_codes_type ON public.access_codes USING btree (code_type);


--
-- Name: idx_feedback_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_status ON public.feedback USING btree (status);


--
-- Name: idx_feedback_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_timestamp ON public.feedback USING btree ("timestamp" DESC);


--
-- Name: idx_feedback_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_type ON public.feedback USING btree (feedback_type);


--
-- Name: idx_feedback_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_type_status ON public.feedback USING btree (feedback_type, status);


--
-- Name: idx_feedback_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_user_id ON public.feedback USING btree (user_id);


--
-- Name: idx_portfolio_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_telegram_id ON public.portfolio_entries USING btree (telegram_id);


--
-- Name: idx_portfolio_token_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_token_address ON public.portfolio_entries USING btree (token_address);


--
-- Name: idx_portfolio_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_updated_at ON public.portfolio_entries USING btree (updated_at DESC);


--
-- Name: idx_portfolio_user_balance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_user_balance ON public.portfolio_entries USING btree (telegram_id) WHERE (current_balance > (0)::numeric);


--
-- Name: idx_portfolio_user_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_user_token ON public.portfolio_entries USING btree (telegram_id, token_address);


--
-- Name: idx_rate_limits_user_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_user_operation ON public.rate_limits USING btree (telegram_id, action);


--
-- Name: idx_temp_sell_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_temp_sell_expires_at ON public.temp_sell_data USING btree (expires_at);


--
-- Name: idx_temp_sell_quote_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_temp_sell_quote_data ON public.temp_sell_data USING gin (quote_data);


--
-- Name: idx_temp_sell_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_temp_sell_telegram_id ON public.temp_sell_data USING btree (telegram_id);


--
-- Name: idx_transactions_confirmed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_confirmed_at ON public.transactions USING btree (confirmed_at);


--
-- Name: idx_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at DESC);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);


--
-- Name: idx_transactions_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_telegram_id ON public.transactions USING btree (telegram_id);


--
-- Name: idx_transactions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_token ON public.transactions USING btree (token_address);


--
-- Name: idx_transactions_token_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_token_address ON public.transactions USING btree (token_address);


--
-- Name: idx_transactions_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_tx_hash ON public.transactions USING btree (tx_hash);


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);


--
-- Name: idx_transactions_user_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user_history ON public.transactions USING btree (telegram_id, created_at DESC);


--
-- Name: idx_transactions_user_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user_recent ON public.transactions USING btree (telegram_id, created_at DESC);


--
-- Name: idx_transactions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user_status ON public.transactions USING btree (telegram_id, status);


--
-- Name: idx_transactions_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user_type ON public.transactions USING btree (telegram_id, type, created_at DESC);


--
-- Name: idx_user_access_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_access_active ON public.user_access USING btree (is_active);


--
-- Name: idx_user_access_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_access_code ON public.user_access USING btree (used_code);


--
-- Name: idx_user_access_granted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_access_granted_at ON public.user_access USING btree (access_granted_at);


--
-- Name: idx_user_access_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_access_telegram_id ON public.user_access USING btree (telegram_id);


--
-- Name: idx_user_states_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_states_expires_at ON public.user_states USING btree (expires_at);


--
-- Name: idx_user_states_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_states_telegram_id ON public.user_states USING btree (telegram_id);


--
-- Name: idx_user_states_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_states_updated_at ON public.user_states USING btree (updated_at);


--
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);


--
-- Name: idx_users_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_activity ON public.users USING btree (last_activity);


--
-- Name: idx_users_registration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_registration ON public.users USING btree (created_at DESC);


--
-- Name: idx_users_telegram_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_telegram_active ON public.users USING btree (telegram_id) WHERE (is_active = true);


--
-- Name: idx_users_telegram_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_telegram_id ON public.users USING btree (telegram_id);


--
-- Name: idx_users_wallet_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_wallet_address ON public.users USING btree (wallet_address);


--
-- Name: feedback trigger_update_feedback_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_feedback_updated_at BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.update_feedback_updated_at();


--
-- Name: user_access fk_user_access_code; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_access
    ADD CONSTRAINT fk_user_access_code FOREIGN KEY (used_code) REFERENCES public.access_codes(code);


--
-- Name: portfolio_entries portfolio_entries_telegram_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_entries
    ADD CONSTRAINT portfolio_entries_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id) ON DELETE CASCADE;


--
-- Name: temp_sell_data temp_sell_data_telegram_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temp_sell_data
    ADD CONSTRAINT temp_sell_data_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id) ON DELETE CASCADE;


--
-- Name: transactions transactions_telegram_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_telegram_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict JO38L8S6epRTB7wckO48y5EaHV4hANww5OTsFMjAMcMSvRfxE3CZJc218ltPy3o

