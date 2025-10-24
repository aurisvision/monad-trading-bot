--
-- PostgreSQL database dump
--

\restrict OqyoGBr1iCbBGfUyBFsH64yewMfWa6LzF02xz89512GiwbYdOXGj9GbGFCU53px

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
-- Data for Name: access_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.access_codes (id, code, code_type, max_uses, used_count, expires_at, description, created_by, created_at, disabled_at, is_active) FROM stdin;
\.


--
-- Data for Name: access_codes_backup_20251011_132039; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.access_codes_backup_20251011_132039 (id, code, used_by, used_at, created_at, code_type, expires_at, created_by, is_active) FROM stdin;
4	A51-46XG4BYY	679766972	2025-09-26 23:08:52.76878	2025-09-26 23:05:21.577738	standard	\N	\N	t
5	A51-YV759PVQ	7196703782	2025-09-26 23:23:17.965703	2025-09-26 23:23:08.628171	standard	\N	\N	t
12	A51_B944P7RA	2008899772	2025-09-27 15:20:51.695077	2025-09-27 02:23:05.797794	standard	\N	\N	t
14	A51_4YX2TZOI	1205766243	2025-09-27 15:28:05.243946	2025-09-27 15:22:36.346819	standard	\N	\N	t
15	A51_F8VUMR19	6719512788	2025-09-27 16:11:26.205331	2025-09-27 16:09:44.340856	standard	\N	\N	t
13	A51_HBRR8QDZ	1269626975	2025-09-27 16:18:16.739054	2025-09-27 15:21:53.064478	standard	\N	\N	t
16	A51_JXH8T44T	\N	\N	2025-09-27 17:01:31.148663	standard	\N	\N	t
17	A51_8GK3FGGF	7416916695	2025-09-27 17:11:05.356951	2025-09-27 17:10:02.050347	standard	\N	\N	t
19	A51_XKQHI8BE	1049894559	2025-10-06 10:06:32.599923	2025-09-29 02:01:22.091341	standard	\N	\N	t
18	A51_UPBYQ14C	1800071101	2025-10-06 19:29:47.248733	2025-09-27 22:20:25.043554	standard	\N	\N	t
20	A51_T12DZBHW	\N	\N	2025-10-06 19:34:10.376998	standard	\N	\N	t
21	A51_F63M75T3	\N	\N	2025-10-06 19:34:12.696461	standard	\N	\N	t
22	A51_7KUHJGUB	\N	\N	2025-10-06 19:34:14.307872	standard	\N	\N	t
24	A51_ETGWQI01	\N	\N	2025-10-06 19:34:22.75513	standard	\N	\N	t
27	A51_89AAUVJP	\N	\N	2025-10-06 19:34:36.950547	standard	\N	\N	t
28	A51_K2F4BVH1	378183612	2025-10-06 20:46:56.076641	2025-10-06 19:34:40.541406	standard	\N	\N	t
23	A51_VOSHVKKM	4690937	2025-10-06 20:47:51.18043	2025-10-06 19:34:20.144287	standard	\N	\N	t
25	A51_PBBICK83	749564036	2025-10-06 20:50:17.941246	2025-10-06 19:34:28.472326	standard	\N	\N	t
29	A51_TJACLEHS	\N	\N	2025-10-06 20:55:31.343303	standard	\N	\N	t
30	A51_V1FW1Z4K	\N	\N	2025-10-06 21:14:10.768517	standard	\N	\N	t
31	A51_Q0TFXTFO	\N	\N	2025-10-06 21:29:49.257446	standard	\N	\N	t
32	A51_DCRC6P07	\N	\N	2025-10-06 21:53:26.680109	standard	\N	\N	t
26	A51_1BZXXCIL	8143777107	2025-10-06 22:40:59.019822	2025-10-06 19:34:31.250262	standard	\N	\N	t
33	A51_5QK9GER2	\N	\N	2025-10-07 12:05:00.902795	standard	\N	\N	t
35	A51_T5U7YHDH	\N	\N	2025-10-07 12:05:12.706298	standard	\N	\N	t
36	A51_WIZBW3UN	\N	\N	2025-10-07 12:05:18.542211	standard	\N	\N	t
37	A51_NE8NU6FX	\N	\N	2025-10-07 12:05:21.519046	standard	\N	\N	t
38	A51_IHF67TMM	\N	\N	2025-10-07 12:05:24.876003	standard	\N	\N	t
39	A51_UGDSEUJF	\N	\N	2025-10-07 12:05:28.718984	standard	\N	\N	t
40	A51_VM65UD0N	\N	\N	2025-10-07 12:05:31.044854	standard	\N	\N	t
41	A51_5W070MTK	\N	\N	2025-10-07 14:28:37.962793	standard	\N	\N	t
42	A51_Q5DF3B1O	\N	\N	2025-10-07 14:28:41.875338	standard	\N	\N	t
43	A51_8KVZ8UU2	\N	\N	2025-10-07 14:28:43.794277	standard	\N	\N	t
44	A51_1HL51HET	\N	\N	2025-10-07 14:28:45.592471	standard	\N	\N	t
45	A51_KRWQKGYP	\N	\N	2025-10-07 14:28:47.562059	standard	\N	\N	t
46	A51_3Y7GKLW1	5621491189	2025-10-07 15:26:56.091604	2025-10-07 15:25:54.734467	standard	\N	\N	t
34	A51_0O4773WC	482566967	2025-10-08 08:56:10.209741	2025-10-07 12:05:03.915867	standard	\N	\N	t
\.


--
-- Data for Name: feedback; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.feedback (id, user_id, username, first_name, feedback_type, feedback_text, "timestamp", status, admin_notes, created_at, updated_at) FROM stdin;
5	6920475855	Yahia_Crypto	Yahia	general	5555555555555555555555	2025-10-06 22:48:00.946306+00	new	\N	2025-10-06 22:48:00.946306+00	2025-10-06 22:48:00.946306+00
6	2008899772	SamuraiKOL	Samurai	general	ggggggggggggggggggggggggggggggg	2025-10-06 22:49:57.423897+00	new	\N	2025-10-06 22:49:57.423897+00	2025-10-06 22:49:57.423897+00
7	6920475855	Yahia_Crypto	Yahia	bug	اااااااااااااااااااشششششششششششششششش	2025-10-12 15:34:33.435257+00	new	\N	2025-10-12 15:34:33.435257+00	2025-10-12 15:34:33.435257+00
8	2008899772	SamuraiKOL	Samurai	bug	ببببببببببببببببببببببببببببببببببببببببببببببببببب	2025-10-12 15:35:06.655933+00	new	\N	2025-10-12 15:35:06.655933+00	2025-10-12 15:35:06.655933+00
\.


--
-- Data for Name: performance_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.performance_metrics (id, metric_name, metric_value, "timestamp", labels, recorded_at) FROM stdin;
\.


--
-- Data for Name: portfolio_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.portfolio_entries (id, telegram_id, token_address, token_symbol, total_bought, total_sold, average_buy_price, current_balance, realized_pnl, unrealized_pnl, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rate_limits (id, telegram_id, action, count, window_start) FROM stdin;
\.


--
-- Data for Name: system_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_metrics (id, metric_name, metric_value, metadata, recorded_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (id, key, value, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: temp_sell_data; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.temp_sell_data (id, telegram_id, token_address, token_symbol, amount, quote_data, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, telegram_id, tx_hash, type, token_address, token_symbol, amount, price_per_token, total_value, gas_used, gas_price, status, block_number, network, created_at, confirmed_at) FROM stdin;
410	1800071101	0x3c20c1d7deb8baa5b146d5a16b8ed0787b0e81747a62985dcb327742f0966206	unknown	0xb2f82d0f38dc453d596ad40a37799446cc89274a	\N	0.599939999999999900	\N	0.595507788835291247	\N	\N	\N	\N	monad	2025-10-06 20:02:43.220791+00	\N
412	1800071101	0xb6b0081221d3cb820b13b298a555f92504335fc1e433499cd33709b487a68b79	unknown	0xf817257fed379853cde0fa4f97ab987181b1e5ea	\N	5.000000000000000000	\N	5.000000000000000000	\N	\N	\N	\N	monad	2025-10-06 20:15:23.32623+00	\N
413	1800071101	0xa768c5f3cd1decbc50b4beb2c9eb0d5b835e1fe95cab274820cae2506ba48705	unknown	0xf817257fed379853cde0fa4f97ab987181b1e5ea	\N	0.004932162807995198	\N	0.001540219977453761	\N	\N	\N	\N	monad	2025-10-06 20:23:17.582289+00	\N
416	8143777107	0xd33f70be2b032804c1127ee03b86eba14adfe9a59b7062969369b11cced37653	unknown	0x0f0bdebf0f83cd1ee3974779bcb7315f9808c714	\N	0.100000000000000000	\N	0.100000000000000000	\N	\N	\N	\N	monad	2025-10-06 22:49:36.57122+00	\N
593	679766972	0x6a36e7710963bfd588a2956b1f811c581eac1591e98489a8bf5d8d5e7a3080fa	unknown	0xf817257fed379853cde0fa4f97ab987181b1e5ea	\N	93.554563608000000000	\N	24.430400738430079158	\N	\N	\N	\N	monad	2025-10-19 00:43:07.018365+00	\N
595	679766972	0xb340f9fd85d2a7df2a11c37b7e5b5cebb5cd574f68057c60e8c582f88ea5bcba	unknown	0xf817257fed379853cde0fa4f97ab987181b1e5ea	\N	5.000000000000000000	\N	5.000000000000000000	\N	\N	\N	\N	monad	2025-10-19 00:59:20.275629+00	\N
421	8143777107	0x17c45410a1a67592ee512a5e45da560a6904bddd59a3fd203c24ef7cf32c805f	unknown	0xe1d2439b75fb9746e7bc6cb777ae10aa7f7ef9c5	\N	1.149884999999999800	\N	1.152299479935269369	\N	\N	\N	\N	monad	2025-10-06 23:31:27.73802+00	\N
602	6920475855	0xaedb4a62021fa37e55c4a0592d83278c41f432e99f0d5075270ed86ad6648a0f	unknown	0xb2f82d0f38dc453d596ad40a37799446cc89274a	\N	47.222421331511875000	\N	30.904635719478545226	\N	\N	\N	\N	monad	2025-10-24 13:59:54.451322+00	\N
603	6920475855	0x630d0a8cc81de846da902d45c4cb7d4a257d1d51324976fd10a4bee945860375	unknown	0xb2f82d0f38dc453d596ad40a37799446cc89274a	\N	10.000000000000000000	\N	10.000000000000000000	\N	\N	\N	\N	monad	2025-10-24 14:00:58.88526+00	\N
604	6920475855	0x4198a9444db81e54c68f2accbbb411bb8dd17af769b8de4a95a093cc681d78c4	unknown	0xb2f82d0f38dc453d596ad40a37799446cc89274a	\N	0.004722242133161774	\N	0.003106018853349856	\N	\N	\N	\N	monad	2025-10-24 14:13:10.386558+00	\N
605	6920475855	0x7c958610fb8ac8a1afbc926fb2e607227bc732d501e6229abaf7861de790bb3f	unknown	0xb2f82d0f38dc453d596ad40a37799446cc89274a	\N	14.914554760988082000	\N	10.088366990309515808	\N	\N	\N	\N	monad	2025-10-24 14:33:03.330806+00	\N
606	6920475855	0x85d4b8cb0adbc1f3b8bf8bcfff87e0c643b760233ae1742a3757bb75958d5d4e	unknown	0x2c05b2c8d65c9be1850f0c4757d785f96759a63c	\N	1.790051851685685800	\N	0.264635130733538422	\N	\N	\N	\N	monad	2025-10-24 18:33:39.259904+00	\N
607	6920475855	0xf7a020abc05aea20e0fe1054fa598d4aef00a3cc5a13f53bc731915c312bb3f5	unknown	0xf817257fed379853cde0fa4f97ab987181b1e5ea	\N	5.000000000000000000	\N	5.000000000000000000	\N	\N	\N	\N	monad	2025-10-24 18:41:21.805601+00	\N
448	1205766243	0x1005763407fe6a147bb5f056faedf2cd747cc866c1268636ffd32202a6036112	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	1.000000000000000000	\N	1.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:48:26.898203+00	\N
449	1205766243	0x7370b16c8634f9de89100938e1a0b88e74b75ced17c5bb0d437f3f08d5d722f1	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	149178.213771407260000000	\N	0.991073835201511479	\N	\N	\N	\N	monad	2025-10-07 19:49:06.734079+00	\N
450	1205766243	0x423777cc8dda82fba297e1677eccdd932122835f6e5b834c7b5e3d39c5a1ccaf	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	1.000000000000000000	\N	1.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:49:38.342009+00	\N
451	1205766243	0x5ab5a1344d842de6171034b49bdab628bc894da7700db948c70966576aca47bc	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	149616.512960772060000000	\N	0.998991909988237112	\N	\N	\N	\N	monad	2025-10-07 19:49:47.434119+00	\N
452	1205766243	0x904c959cbc968f7b661ac5b1f8668bde25611e8b5bf27292f860c3c30d1fea1e	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	1.000000000000000000	\N	1.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:50:32.725604+00	\N
453	1205766243	0xd85b867b0e586216a2fd24e02c4d37e7210eaf826fad4ea9302662de1fe87da5	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	1.000000000000000000	\N	1.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:50:42.466206+00	\N
454	1205766243	0x710e9979c75fcc116c096a32f06b30891379348355d5c65692253ba9f2483227	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	296881.652048297000000000	\N	2.020126164634179691	\N	\N	\N	\N	monad	2025-10-07 19:50:59.828562+00	\N
455	1205766243	0x0b100e2657b6872e77124790887bfc8cdfbc046d13abf9c511a188af89bf1f89	unknown	0x268e4e24e0051ec27b3d27a95977e71ce6875a05	\N	1.000000000000000000	\N	1.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:51:14.378403+00	\N
456	1205766243	0xacfb6e4868b4a57ccbbc3268f562d1a8dfc356e3dd0f985e62042ddc53017285	unknown	0x268e4e24e0051ec27b3d27a95977e71ce6875a05	\N	1.440347726348799800	\N	0.993929012441580140	\N	\N	\N	\N	monad	2025-10-07 19:52:18.527224+00	\N
457	1205766243	0xb972bfa50f9941bc52c766f698514b7d017878fef54adac4e62c7c8581f6c4db	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	296881.652048297000000000	\N	2.020126164634179691	\N	\N	\N	\N	monad	2025-10-07 19:52:32.877585+00	\N
458	1205766243	0x4ede8dbea83dfe9ee5c1de9d884056c61f150831f16e50a1101afb66a2d02947	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	296881.652048297000000000	\N	2.020126164634179691	\N	\N	\N	\N	monad	2025-10-07 19:52:56.429171+00	\N
459	1205766243	0x70c16c79249f6b80c7d432dec1e3cb823c40761656b4540d30113e0d79586f45	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	296881.652048297000000000	\N	2.020126164634179691	\N	\N	\N	\N	monad	2025-10-07 19:53:17.78844+00	\N
460	1205766243	0x7e323f4a95029b37e76ec87c8f6419451af9b0cd81549922bf9da8b0a223cc10	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	222683.507386961460000000	\N	1.493250741003874169	\N	\N	\N	\N	monad	2025-10-07 19:53:26.663559+00	\N
461	1205766243	0xec53c01fd6e2dcbe9e9220f674cbce7e19759aaa8d63d2015f908cde478c746b	unknown	0xcf5a6076cfa32686c0df13abada2b40dec133f1d	\N	1.000000000000000000	\N	1.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:54:33.29081+00	\N
462	1205766243	0x36680212139aa4da226d83f390196bc05b7f8cb5b5f218c0965a68833b84152d	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	2.000000000000000000	\N	2.000000000000000000	\N	\N	\N	\N	monad	2025-10-07 19:55:30.833345+00	\N
463	1205766243	0xd3d486cda5c0782f6e58ba19279ac09aef8e9321425c842759f8af77be9379a3	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	370238.090613511600000000	\N	2.522039581705396462	\N	\N	\N	\N	monad	2025-10-07 19:55:46.730433+00	\N
464	1205766243	0x9ef902ab33ca7d4dbb3ce8d59632fa3d66e663482344b2716aeb3724690b8058	unknown	0xbf9307ca0543654e1988e02ab7c968fce7fea318	\N	277706.338593993160000000	\N	1.865573210442779151	\N	\N	\N	\N	monad	2025-10-07 19:56:18.023805+00	\N
601	6920475855	0x5c8a09e83d25fce6e1a84e3e3686cbf02361496e825cdcdd4fcc08bf29b59c7e	unknown	0xe0590015a873bf326bd645c3e1266d4db41c4e6b	\N	4.000000000000000000	\N	4.000000000000000000	\N	\N	\N	\N	monad	2025-10-21 03:24:29.130013+00	\N
\.


--
-- Data for Name: user_access; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_access (id, telegram_id, used_code, access_granted_at, user_info, revoked_at, is_active) FROM stdin;
\.


--
-- Data for Name: user_access_backup_20251011_132039; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_access_backup_20251011_132039 (id, telegram_id, access_code, granted_at, used_at, is_active, used_code, access_granted_at) FROM stdin;
\.


--
-- Data for Name: user_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_settings (id, telegram_id, gas_price, slippage_tolerance, sell_gas_price, sell_slippage_tolerance, auto_buy_enabled, auto_buy_amount, auto_buy_gas, auto_buy_slippage, custom_buy_amounts, custom_sell_percentages, turbo_mode, turbo_mode_updated_at, gas_settings_updated_at, slippage_settings_updated_at, created_at, updated_at) FROM stdin;
144	6920475855	100000000000	5.00	50000000000	5.00	t	10.0000	200000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-21 03:02:33.994+00	2025-10-24 14:00:28.884+00	2025-10-19 11:43:58.081941+00	2025-10-19 11:43:58.081941+00	2025-10-24 14:00:28.887539+00
137	7196703782	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00	2025-10-19 00:50:23.311003+00
140	1938209223	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00	2025-10-19 00:50:23.311003+00
36	679766972	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-19 00:42:57.112+00	2025-09-26 20:08:52.787376+00	2025-09-26 20:08:52.787376+00	2025-09-26 20:08:52.787376+00	2025-10-19 00:50:23.311003+00
113	1800071101	110000000000	5.00	110000000000	5.00	t	5.0000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-06 20:13:46.363+00	2025-10-06 19:29:47.261831+00	2025-10-06 19:29:47.261831+00	2025-10-06 19:29:47.261831+00	2025-10-19 00:50:23.311003+00
116	378183612	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00	2025-10-19 00:50:23.311003+00
117	4690937	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-06 20:48:54.631+00	2025-10-06 20:47:51.183965+00	2025-10-06 20:47:51.183965+00	2025-10-06 20:47:51.183965+00	2025-10-19 00:50:23.311003+00
118	749564036	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00	2025-10-19 00:50:23.311003+00
120	8143777107	110000000000	5.00	110000000000	5.00	t	0.1000	52000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-06 22:48:03.459+00	2025-10-06 22:47:10.871+00	2025-10-06 22:40:59.028727+00	2025-10-06 22:40:59.028727+00	2025-10-19 00:50:23.311003+00
124	5621491189	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00	2025-10-19 00:50:23.311003+00
131	1205766243	110000000000	5.00	110000000000	5.00	t	2.0000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-07 19:49:25.983+00	2025-10-07 19:47:06.334848+00	2025-10-07 19:47:06.334848+00	2025-10-07 19:47:06.334848+00	2025-10-19 00:50:23.311003+00
134	482566967	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00	2025-10-19 00:50:23.311003+00
104	1049894559	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00	2025-10-19 00:50:23.311003+00
139	2008899772	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00	2025-10-19 00:50:23.311003+00
90	7416916695	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00	2025-10-19 00:50:23.311003+00
91	1269626975	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00	2025-10-19 00:50:23.311003+00
92	6719512788	110000000000	5.00	110000000000	5.00	f	0.1000	110000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00	2025-10-19 00:50:23.311003+00
\.


--
-- Data for Name: user_settings_backup_20251019_024911; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_settings_backup_20251019_024911 (id, telegram_id, gas_price, slippage_tolerance, sell_gas_price, sell_slippage_tolerance, auto_buy_enabled, auto_buy_amount, auto_buy_gas, auto_buy_slippage, custom_buy_amounts, custom_sell_percentages, turbo_mode, turbo_mode_updated_at, gas_settings_updated_at, slippage_settings_updated_at, created_at, updated_at) FROM stdin;
14	9999999999	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-17 12:49:51.657851+00	2025-09-17 12:49:51.657851+00	2025-09-17 12:49:51.657851+00	2025-09-17 12:49:51.657851+00	2025-09-17 12:49:51.657851+00
137	7196703782	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00	2025-10-12 06:59:53.457998+00
140	1938209223	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00	2025-10-15 20:49:49.722391+00
36	679766972	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-19 00:42:57.112+00	2025-09-26 20:08:52.787376+00	2025-09-26 20:08:52.787376+00	2025-09-26 20:08:52.787376+00	2025-10-19 00:42:57.112972+00
113	1800071101	50000000000	5.00	50000000000	5.00	t	5.0000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-06 20:13:46.363+00	2025-10-06 19:29:47.261831+00	2025-10-06 19:29:47.261831+00	2025-10-06 19:29:47.261831+00	2025-10-06 20:14:12.458264+00
116	378183612	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00	2025-10-06 20:46:56.08341+00
117	4690937	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-06 20:48:54.631+00	2025-10-06 20:47:51.183965+00	2025-10-06 20:47:51.183965+00	2025-10-06 20:47:51.183965+00	2025-10-06 20:48:54.632256+00
118	749564036	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00	2025-10-06 20:50:17.944387+00
120	8143777107	50000000000	5.00	50000000000	5.00	t	0.1000	52000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-06 22:48:03.459+00	2025-10-06 22:47:10.871+00	2025-10-06 22:40:59.028727+00	2025-10-06 22:40:59.028727+00	2025-10-06 22:48:03.460544+00
124	5621491189	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00	2025-10-07 15:26:56.098618+00
131	1205766243	50000000000	5.00	50000000000	5.00	t	2.0000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-07 19:49:25.983+00	2025-10-07 19:47:06.334848+00	2025-10-07 19:47:06.334848+00	2025-10-07 19:47:06.334848+00	2025-10-07 19:55:21.144086+00
134	482566967	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00	2025-10-08 08:56:10.22705+00
104	1049894559	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00	2025-10-06 10:06:32.615242+00
139	2008899772	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00	2025-10-12 19:31:18.438412+00
90	7416916695	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00	2025-09-27 21:21:17.549241+00
91	1269626975	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00	2025-09-27 21:21:17.568281+00
92	6719512788	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00	2025-09-27 21:21:17.585205+00
93	888888888	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.619109+00	2025-09-27 21:21:17.619109+00	2025-09-27 21:21:17.619109+00	2025-09-27 21:21:17.619109+00	2025-09-27 21:21:17.619109+00
94	999999999	50000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	f	2025-09-27 21:21:17.636663+00	2025-09-27 21:21:17.636663+00	2025-09-27 21:21:17.636663+00	2025-09-27 21:21:17.636663+00	2025-09-27 21:21:17.636663+00
141	6920475855	100000000000	5.00	50000000000	5.00	f	0.1000	50000000000	5.00	0.1,0.5,1,5	25,50,75,100	t	2025-10-19 00:40:11.154+00	2025-10-18 21:07:34.99373+00	2025-10-18 21:07:34.99373+00	2025-10-18 21:07:34.99373+00	2025-10-19 00:40:11.155344+00
\.


--
-- Data for Name: user_states; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_states (telegram_id, state, state_data, created_at, updated_at, expires_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, telegram_id, username, wallet_address, encrypted_private_key, encrypted_mnemonic, created_at, updated_at, last_activity, is_active) FROM stdin;
63	8143777107	zi_Dev	0x8aB1E88b29b401b8D66875b39379676636A9f1Ad	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:84e859eeda7eba784e9a2a4b:5871d8b2aba716801694a6e4a93e1e4c:b7c6922cc541dca1c8f022e45e53486e6e7b34f303eb812318d75db9de7d5311:dc4c6c3ab43b89ff38dfd28c3a89ada3fc7b37f1b2ca32d058d3dd6d644ce6e07dea2c50e6487a9b6bc2656bd758b4e89b547b80a0265885d0f661b39d16ff104ef6	\N	2025-10-06 22:40:59.025926+00	2025-10-06 22:44:15.594433+00	2025-10-11 19:42:37.162545+00	t
40	7416916695	EngRaider	0x4680d8f94552B7736f9075001AAD1E95fE079aC0	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:f146fd798e7c2c533bf72118:fd5857f95cfff9d4c183266592b80943:439d74844d2e7136808e6aef2507585c8ce0c399fb34d90fe4c5da9b104d2755:a7d2e34b4dac0db129f68552763e640de671e2b046a1723d107581a1a5c7848473beda976ef6082d96984c68ecdec8fa72ef0acbe1f06e8b469db859f711d962cf1e	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:af2a0ecc6b8131526b72dd7b:86e57d13d2654c4b2385d31e00af3f67:501ebb4861ec88806255ef8743b0eaaaa59f65fc37ac4c83f63fffcbe6b50073:d4977ca88df432bd80b8f37aa66950248d042913cd7baedbf4b8ab685c5686eb8634ace6326f0057827d743c7ab3a6b4600ae1efdaa23ddb2a7c5c27c458ef9e16	2025-09-27 17:11:05.359999+00	2025-09-27 17:11:12.752608+00	2025-10-13 00:18:18.055586+00	t
61	749564036	Osa1992ma	pending_wallet_creation	pending_key_creation	\N	2025-10-06 20:50:17.942942+00	2025-10-06 20:50:17.942942+00	2025-10-09 11:05:16.070613+00	t
38	6719512788	user_6719512788	0x98AdbF72498569d63f06eA0eC9A1CA57856c2820	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:5836ceab53582abc7a5b7a70:4d1dcb23e24440ce03a34f032e1a4fe7:8ebfdce29162d50cc6a36be553249f7979bed81777a5a2dce565dad60fb1d7b1:0f273259b4a6574834a6dcfe619046048cc36219aa52f1c5e3aef2daf181cdfffbfb37de5350c824e6435fc37497cf0ad23d221cea59441690ee3ef012d693c524b6	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:360b43dbbe4700f0065a7b5c:87f4e54a150bb2b74cbac60392bfd2a7:089fbced28b978599ac6e7721f9d2a4b3b99cfa7190d0d1318099536246b4bef:0e38adfd01458c0666b597a7c77291eeb7b5a2382d332e4039fb7e7424fd79df321b90d8cdbdc779f0adc9018b8620870c65c22a133955e586846edabeb6d0fa9f195b28e1c4388714df	2025-09-27 16:11:26.209599+00	2025-09-27 16:11:37.115069+00	2025-10-05 19:13:22.401139+00	t
39	1269626975	MadriidisTaaa	0x310D7CE777B6bb1b062B224d631a039d0155C791	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:c4f19fbeab426dc8255f44e9:24bce507f05cbfb24bc47dbb0666217b:6a7de30d908047beada60a56262e3ae8be958fd4d8c4875320a9a0a0fb9ccc6a:2240f51872ba337f9e338a3bfce12741825138ea2a5d57a926c22f5cea73b226aaa751c572fe5d29713618f604e77fd3c3b5bb8dbf474942f81992dce99b622679fc	\N	2025-09-27 16:18:16.741104+00	2025-09-28 00:15:35.967283+00	2025-10-06 00:04:43.667876+00	t
79	1938209223	sui_65	0xee9d52C827B78A6e4486F324292d1bc21a00b065	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:ccb0addc6507cc2c5311d2f6:be4264e6183086aff225673aa82f9fd3:8879c36869ed9060be503a6f28fed5b7e5fc569dc2e10f0bb07c912d22588594:efa469253dbacf5e2f4eefec05a2cbcb60891f4d5ddc633bd4df6dc472f047b2e418879c00931d98845853132bc9fd080312d90ad7c1bcedacb2f99f342491e6f211	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:5cf0acf3cd68f686319c6508:6175474cdab2ce46af9652170a667577:b51069acda89be0d0e9e99613cdeacde832f67c95c2e5acdf6a104891deb220b:2ad27f0006461f0436693bb476e4a65db9c04c42cb749a94006f1067a7e6c631c42b3b2d3cc165dc160b9d98079c532862768f4a23190522da364ff560557e81cb4504ab9f131635df91f659	2025-10-15 20:49:49.717432+00	2025-10-15 20:49:50.046192+00	2025-10-15 20:50:07.983096+00	t
76	7196703782	Nancy_sherif	0x81bD02a827F3e4b466C53c32b41e296b2E3c7f47	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:9bf20144a008c88e4b277318:73d0681b08f092e817dbd6edaa4452cf:c191099d33a3ed963e5e7c6a1180b6ba8249ca345a372e5d9faa52bb58bf30a2:c2acf43370f605a885e5646e5d5237a080daf04a76ae66f0d7ae1f044efc80f7af200d4c7b85faf042973efb25eb3e2837253ab4d6bdcbf3ea6fa565cbc6a5876b77	\N	2025-10-12 06:59:53.456578+00	2025-10-12 06:59:55.44278+00	2025-10-12 06:59:55.44278+00	t
57	1800071101	NONA6601	0x9DA4B0a0D5D4adf34f83f4E024A680469E5CDF83	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:35de7939e26447706d1de78a:ed4f8cea410ced5a62bca16804965109:522a29aa4321a44ff2d69e74a3a7b20f2996b019c3e0ad51f2c364d1ee5fc1b5:7e7290f7375c4f665cd03f81f3a66623f621dd0dd9d44ab3c2bd5ba0d10bd1aaa58e2fd54aa7de97665ce42793200dd97218b59472e751591c64cc2bcb401a3f1d6d	\N	2025-10-06 19:29:47.25602+00	2025-10-06 19:39:47.698487+00	2025-10-07 04:38:38.680165+00	t
59	378183612	shnxbd	pending_wallet_creation	pending_key_creation	\N	2025-10-06 20:46:56.080913+00	2025-10-06 20:46:56.080913+00	2025-10-06 20:47:04.613576+00	t
49	1049894559	A_OZMO	0x7dB6ed46ca2368c503e5c2e0CC25352A0574b60A	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:dfc6a137ec0d467e685cb0af:67d388233234428378e83f870bdcf88f:9c3ea2680407714142c9275cffab81a57a9303214a63e2cc4ffb947d6fbeafca:8d4835ad0b9a5b00105d61f11aa97aa54ad77653137da45012fa9094af598b420fb896a98f0a9b5769b93a6b0ff36a6025921c3b6febe3499293882d703d427b4080	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:559f3c2b008457b2dcd772db:47abe87d4ead6d3b6375125e147d59c8:2c22fae6c6b4f28dd18e5d4d68da1d29549ae777da87828ad37141a29c4d1da2:2c2287cbf278cb825e6659f163d84453e311b840a18b72ab9d0c3f1c539304c74eff84d1c54531522336fc85fc9921546712978f5a5fd9ba7840de16964a37090cf1821903129948bd7bec5ff785a5758d33306b6dc2	2025-10-06 10:06:32.603278+00	2025-10-19 11:42:19.371928+00	2025-10-19 11:42:43.674611+00	t
33	679766972	FF8QQ	0x77ce5F98045d41591eaDd9aDCB35177D9259c05e	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:9ae1cd03298e04f889ba0ae5:4b95c9906e3ec1a868e7b36be4e6af46:c0ff88dda02e27bb719b6760b4f22a614961571695a10b6896bf279b066eaa98:85ff7044b02069dd67d01969656fcc4065872ee20d257626ef37403a72f70f0950f62893358f884c31b7744fd9a91aeba0f350294d234862669452e7c6e9d3c0d511	\N	2025-09-26 20:08:52.775525+00	2025-09-27 17:26:40.751439+00	2025-10-19 00:59:17.339745+00	t
78	2008899772	SamuraiKOL	pending_wallet_creation	pending_key_creation	\N	2025-10-12 19:31:18.432439+00	2025-10-12 19:31:18.432439+00	2025-10-19 00:41:07.118223+00	t
73	482566967	Vad_Private	0xa59F0c2ac2b60C6ed8cB086a676D4f40a7D65A13	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:524cf51156926cee5b461dfa:b091d846c8539459013e27b08c71f211:aae36c5c2ea9fd62c94b2eb9c275204548287f9d41a40067246abe362a36ee59:eee8fab38d86ddf5000b6eeb406f43ec0e009b614bee586552ae49ac84506e732d550dcc841d5527c08a7dc76a781d82aa94a2eab10c722b097bddca11f05ed6fdb3	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:f44f3f7fc29f5f9f051b2227:94a91e7cb73da93a460ca6e6a15b8992:855db38b644eb9369987383704a0eacaa076325187d852bd7b37cf99d3897653:027759e6009f347cab813f89f2d6ca2f6a8406b24a88a73c7ed3a233260fdca3297128ae3a898e50da18e4408d52a98648dd61660269d2dcb8bf32d7cbf8abf509da2cc0bb4335ef7c0c	2025-10-08 08:56:10.213528+00	2025-10-08 08:56:18.335038+00	2025-10-20 18:10:35.533169+00	t
60	4690937	waelsakr1	0xae7a75e8bE27929736fbB413352dc86cD43228E7	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:d264b721911520ba04825604:6c4c328d8affc2a2e0dcc8c68175b87b:eb10c492a26d17b4895f1534f47029d3db023d2ed94f0c55fcdf1859e5bb7a39:e3f7ef041cdd35666102dffa5bc2f8d15814995584208dc1d46bbc240ff1bc12d002be518c37ef068cab8b96d1068624541914b4b05a7aba0764c914618f24687c55	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:4b397cfa37077ad74154e4c1:9fdc58f355a10793bee8bb83c1ade26e:ac1906be080c44d548b2a43264856924bba9dafa78194b3a59402cac0e15cdb8:3c23a55a31fbf81559247286a872f2fb416de02e82ff2c160247fc7dea1f49c1cb3916e963c44eb371a287996d496e60ad42b0b1c64885ab1d0297e4e0ee316b01d5779a8729	2025-10-06 20:47:51.182676+00	2025-10-06 20:47:58.989611+00	2025-10-06 20:49:04.759074+00	t
65	5621491189	Mod7400	0x8de3d1985BA23C386215573e1B6A2e996d316e21	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:dbac7f62a66437ef808c963b:3cde6050fbb40f9d987ad7a8ec2cfd5b:5e9abad2b1f57f61afb5c6f8303a1fa7aa075fb7d1fa8e562904ed3f2eb59225:f4daf058f900b9210f0fe2840d48e5d026fa24cbcfab99b192430e89e3b59460542b80ecfef09df1463a71ced68d3171c78ed74ecf0581fd2dc32dfc815af5c40d40	v3:c5f99d0ca6c4535ed590aae6d11f291a489b169c9f50f9d9d6976917210a68ba:8c17c6c3d0d28e23294d571e:a11aae1ee864401b835d2f1c71cfcddc:9393833b93730ed576f51261c229a5d7a0f00f4ae0fe3204afc950b907abc455:898b52e4807ee17ee7c8034fa897cf6e2246b67aa5d7568cdf36c6e58d5d2094abde7ccdee500eb0de5daeeb914f62b233adf3919df150ed563ddb40cd3bd6c33d9217c5a685d00a43173b6d	2025-10-07 15:26:56.095447+00	2025-10-07 15:27:02.371845+00	2025-10-07 15:27:33.652788+00	t
72	1205766243	Rabi3x	0xa32a4f0000dACbcb74E180efF7de068962E0Da97	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:9994011f0b934f8ae0b4bfe9:0babe47d52ede092399cc7ad62dc389a:ddb52de61e4f69ba055c28a98c46478e65c34ab6734304963192bac105e71464:fe789c66dd7bdae51b990ea4e555969f01eac0f83963aa19de7e9cdb27a4b0ac275ccc020fe6cf23f7299bfaf015dd512e059437f6c5f1402528652b346bec63a4a7	\N	2025-10-07 19:47:06.332714+00	2025-10-07 19:47:16.183536+00	2025-10-21 03:50:55.288672+00	t
83	6920475855	Yahia_Crypto	0x77ce5F98045d41591eaDd9aDCB35177D9259c05e	v3:48b3b6a6dc382a2f8d5fbb778e4024a08515d7b3f4f0ab741672a0937cfaf514:8e5347db6a0d3e0520e474c9:0a9595a7fb398384e3a58a6e79c8f64a:ae5a40633fb55b99650345d09baf995c0e1236d87dd06f2d4e6377a7012a0c25:0f836fa01535006933087ca45d069447f85d94a81f0a41eee70c6a72f4058feef5e1c6965fc12d715dd1642574c9553b60ac8906305a4a75d015dbbd0a70f14cab2d	\N	2025-10-19 11:43:58.078919+00	2025-10-19 11:44:00.312448+00	2025-10-24 18:41:18.312947+00	t
\.


--
-- Name: access_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.access_codes_id_seq', 1, false);


--
-- Name: feedback_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.feedback_id_seq', 8, true);


--
-- Name: performance_metrics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.performance_metrics_id_seq', 1, false);


--
-- Name: portfolio_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.portfolio_entries_id_seq', 1, false);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rate_limits_id_seq', 1, false);


--
-- Name: system_metrics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_metrics_id_seq', 1, false);


--
-- Name: system_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_settings_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transactions_id_seq', 607, true);


--
-- Name: user_access_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_access_id_seq', 1, false);


--
-- Name: user_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_settings_id_seq', 145, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 83, true);


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

\unrestrict OqyoGBr1iCbBGfUyBFsH64yewMfWa6LzF02xz89512GiwbYdOXGj9GbGFCU53px

