--
-- PostgreSQL database dump
--

\restrict lCMwhS839971O6JRR0IxWZwXKuIDJNdRgkLEvhfDbNByergb8DHBKANBKKskO7r

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: provider_model_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.provider_model_credentials (id, tenant_id, provider_name, model_name, model_type, credential_name, encrypted_config, created_at, updated_at) VALUES ('019d2de7-4dcf-76cd-a8be-0c83f7d83e1a', 'a5a0c164-1f4f-40f8-a6fa-2e3ef4267dcc', 'langgenius/openai_api_compatible/openai_api_compatible', 'glm-4.7', 'text-generation', 'zhipu-main', '{"display_name": "\u667a\u8c31 GLM-5", "api_key": "SFlCUklEOiLR12YPyhXn9aw4JvVnUL/43tEJG4OTH8yXi+cWUe8dwOQ9d1WYy8y0F2oB0BDqWrz8FAqHrrkdpFlAi053ovC7+rQYoab2OsfIKa6SWRzGc8Egq3JW1d4GD/tc/mDNU3TAxXKnLWxItr5Xr9AIIxxQ5+dhCpRP5FRyL/3S/B7rcHCl4Reu4M8BzohHuK4l/N35g7de6WGiiWdfJi+tGV16fPPfT5RT1fIEzpnQz2fciUogvAATNGnhENpAyB0LkNKTC05TZE1ICIImEPyEFdAemczMI1fgHoj2xkcAmB2kLEKLsAK1xwv4IPUF/OYv/mvEUgjp7jMj7QGZtTwOXA/kU2urZmeYschkEfuKWGJh/hnL+8+nSeQYnV7PeeK2WYql+5Q3PQGlTf4ddeE6kzBL139N4ERGOCnK8ITiM4H0+hqLDIrb5Bv5hp1iNjEp3Mk=", "endpoint_url": "https://open.bigmodel.cn/api/paas/v4/", "endpoint_model_name": "glm-5", "mode": "chat", "context_size": "4096", "max_tokens_to_sample": "4096", "agent_thought_support": "not_supported", "compatibility_mode": "strict", "token_param_name": "auto", "function_calling_type": "no_call", "stream_function_calling": "not_supported", "vision_support": "no_support", "structured_output_support": "not_supported", "stream_mode_auth": "not_use", "stream_mode_delimiter": "\\n\\n"}', '2026-03-27 06:07:05.478098', '2026-03-27 06:10:41.341382');
INSERT INTO public.provider_model_credentials (id, tenant_id, provider_name, model_name, model_type, credential_name, encrypted_config, created_at, updated_at) VALUES ('019d85d7-fbf5-7391-a044-4a0e69984f5f', 'a5a0c164-1f4f-40f8-a6fa-2e3ef4267dcc', 'langgenius/openai_api_compatible/openai_api_compatible', 'gpt-5.4-mini', 'text-generation', 'API KEY 1', '{"display_name": "gpt-5.4-mini", "api_key": "SFlCUklEOh8a2iK49pXtKoFaIEiHkPCd8aMH1NwyoHagTQgHdaMWfuGQpw/OU/tsRqXJ063h+FMHO+ALzJcjF3gAEWC7gELoM6vp6gUqPdJZs2xRv7ORN88jQ8rl4Y6xiQebqEOKhQk9e/gvEAPyMb//3pF6vzql9FVPDmQgVZi7FUJUMMdNTHHe3tcFQyVkyIuQNLSkUDpxHtbvAnkdE8zqx9P1Ssc+wsyVjasj5t8HJC5p4Ud9g2rGblACz6BLw7NGVcfKxQrbCEPVBdlr/6REEaD28wLjJjOhBsn4WB+Z4VJ+Ejo7bijJsTB2rUhgJpPARBIMRdUEztnwM80OGCHaGICpxoSDO8dr2gFgJBaVJiNQOlidt/YosJevnyHFJwBbC0ceNAUikAOATYC2m7CGuN3y7d4tw+DjbayVsFq9V7Fv6oql0PHRR3HTgu3FtRsN5krU0vAfOA==", "endpoint_url": "https://yunwu.ai/v1", "endpoint_model_name": "gpt-5.4-mini", "mode": "chat", "context_size": "128000", "max_tokens_to_sample": "8192", "agent_thought_support": "not_supported", "compatibility_mode": "strict", "token_param_name": "auto", "function_calling_type": "no_call", "stream_function_calling": "not_supported", "vision_support": "no_support", "structured_output_support": "supported", "stream_mode_auth": "not_use", "stream_mode_delimiter": "\\n\\n"}', '2026-04-13 07:56:56.488746', '2026-04-13 08:08:20.52575');


--
-- Data for Name: provider_models; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.provider_models (id, tenant_id, provider_name, model_name, model_type, is_valid, created_at, updated_at, credential_id) VALUES ('7ab5a4f1-a19f-417b-b335-4c960da7e334', 'a5a0c164-1f4f-40f8-a6fa-2e3ef4267dcc', 'langgenius/openai_api_compatible/openai_api_compatible', 'glm-4.7', 'text-generation', true, '2026-03-27 06:07:05', '2026-03-27 06:07:05', '019d2de7-4dcf-76cd-a8be-0c83f7d83e1a');
INSERT INTO public.provider_models (id, tenant_id, provider_name, model_name, model_type, is_valid, created_at, updated_at, credential_id) VALUES ('08d71961-6065-4a61-833d-9e81410fc329', 'a5a0c164-1f4f-40f8-a6fa-2e3ef4267dcc', 'langgenius/openai_api_compatible/openai_api_compatible', 'gpt-5.4-mini', 'text-generation', true, '2026-04-13 07:56:56', '2026-04-13 07:56:56', '019d85d7-fbf5-7391-a044-4a0e69984f5f');


--
-- Data for Name: providers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.providers (id, tenant_id, provider_name, provider_type, is_valid, last_used, quota_type, quota_limit, quota_used, created_at, updated_at, credential_id) VALUES ('019b443a-7eff-72f1-a5aa-21d918987dfc', 'a5a0c164-1f4f-40f8-a6fa-2e3ef4267dcc', 'langgenius/siliconflow/siliconflow', 'custom', true, NULL, '', NULL, 0, '2025-12-22 04:04:01', '2026-04-09 06:40:42.828957', '019d70f8-af6f-74b0-b6ec-be59831ace1a');
INSERT INTO public.providers (id, tenant_id, provider_name, provider_type, is_valid, last_used, quota_type, quota_limit, quota_used, created_at, updated_at, credential_id) VALUES ('019d2365-1747-71fc-af1d-e87c8c55c98b', 'a5a0c164-1f4f-40f8-a6fa-2e3ef4267dcc', 'langgenius/zhipuai/zhipuai', 'custom', true, NULL, '', NULL, 0, '2026-03-25 05:08:16', '2026-04-09 07:38:14.853688', '019d711c-f273-73c7-b585-564760007b1e');


--
-- Data for Name: tenant_preferred_model_providers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- PostgreSQL database dump complete
--

\unrestrict lCMwhS839971O6JRR0IxWZwXKuIDJNdRgkLEvhfDbNByergb8DHBKANBKKskO7r

