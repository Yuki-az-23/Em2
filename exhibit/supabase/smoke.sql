-- =============================================================================
-- Smoke test for schema.sql. Runs as superuser on a fresh database, inside one
-- transaction that is rolled back, so it is repeatable. Every block raises on
-- failure; psql stops on the first error.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Pretend to be an anonymous web visitor from one address.
SELECT set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.app_settings SET value = '0' WHERE key = 'feed_pi';   -- make the feed deterministic

-- 1. The door: three invites pass, the fourth is refused with a retry time.
DO $$ DECLARE r JSONB; i INT; msg TEXT;
BEGIN
  FOR i IN 1..3 LOOP
    r := public.create_invite('דני', 'participant', 'trust_signal');
    IF (r->>'code') IS NULL OR char_length(r->>'code') <> 22 THEN RAISE EXCEPTION 'invite code malformed: %', r; END IF;
    IF (r->>'telegram_link') NOT LIKE 'https://t.me/%?start=%' THEN RAISE EXCEPTION 'telegram link malformed: %', r; END IF;
  END LOOP;
  BEGIN
    r := public.create_invite('דני', 'participant', 'trust_signal');
    RAISE EXCEPTION 'fourth invite should have been rate limited';
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
    IF msg NOT LIKE 'RATE_LIMITED:%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok 1: door and rate limit (%)', msg;
END $$;
DELETE FROM public.rate_limits;

-- 2. Two people: A claims from Telegram, invites B, B claims and they are contacts.
CREATE TEMP TABLE t (k TEXT PRIMARY KEY, v TEXT);
DO $$ DECLARE inv JSONB; a JSONB; pair JSONB; b JSONB;
BEGIN
  inv := public.create_invite('אלה', 'participant', 'amplifier_shapes');
  a := public.claim_invite(inv->>'code', 1001);
  INSERT INTO t VALUES ('A', a->>'profile_id'), ('A_handle', a->>'handle');
  -- claiming twice is refused
  BEGIN PERFORM public.claim_invite(inv->>'code', 1001); RAISE EXCEPTION 'second claim should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'INVITE_EXPIRED' THEN RAISE; END IF; END;
  PERFORM public.record_consent((a->>'profile_id')::uuid);
  pair := public.create_pair_invite((a->>'profile_id')::uuid);
  IF (SELECT from_handle FROM jsonb_to_record(public.peek_invite(pair->>'code')) AS x(from_handle TEXT)) <> (a->>'handle') THEN
    RAISE EXCEPTION 'peek_invite should show the inviter handle';
  END IF;
  b := public.claim_invite(pair->>'code', 1002);
  INSERT INTO t VALUES ('B', b->>'profile_id'), ('B_handle', b->>'handle');
  IF (b->>'paired_with')::uuid <> (a->>'profile_id')::uuid THEN RAISE EXCEPTION 'B should be paired with A'; END IF;
  IF NOT public.are_contacts((a->>'profile_id')::uuid, (b->>'profile_id')::uuid) THEN RAISE EXCEPTION 'A and B should be contacts'; END IF;
  RAISE NOTICE 'ok 2: A=% B=%', a->>'handle', b->>'handle';
END $$;

-- 3. Exchange: refused before B consents, then opens, two messages, close returns the bundle.
DO $$ DECLARE a UUID := (SELECT v FROM t WHERE k='A')::uuid; b UUID := (SELECT v FROM t WHERE k='B')::uuid; x UUID; bundle JSONB;
BEGIN
  BEGIN PERFORM public.open_exchange(a, b, 'telegram'); RAISE EXCEPTION 'exchange should need consent';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'CONSENT_MISSING' THEN RAISE; END IF; END;
  PERFORM public.record_consent(b);
  x := public.open_exchange(a, b, 'telegram');
  IF public.open_exchange(a, b, 'telegram') <> x THEN RAISE EXCEPTION 'one open exchange per pair'; END IF;
  PERFORM public.append_message(x, a, 'זוכר את החוף בחיפה עם דנה? הים היה שטוח.');
  PERFORM public.append_message(x, b, 'זוכר. אמרת שים שטוח אומר שמותר להתחיל מחדש.');
  BEGIN PERFORM public.append_message(x, gen_random_uuid(), 'מי אני'); RAISE EXCEPTION 'stranger should not write';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF; END;
  bundle := public.close_exchange(x);
  IF jsonb_array_length(bundle->'messages') <> 2 THEN RAISE EXCEPTION 'bundle should carry 2 messages: %', bundle; END IF;
  IF jsonb_array_length(bundle->'participants') <> 2 THEN RAISE EXCEPTION 'bundle should carry 2 participants'; END IF;
  IF (bundle->'participants'->0->'consent'->>'version') IS NULL THEN RAISE EXCEPTION 'bundle should carry consent snapshot'; END IF;
  -- the order is the exchange's (inviter first), so the same two states always give the same card
  IF (bundle->'participants'->0->>'id')::uuid <> a OR (bundle->'participants'->1->>'id')::uuid <> b THEN RAISE EXCEPTION 'bundle participants out of order'; END IF;
  BEGIN PERFORM public.append_message(x, a, 'עוד'); RAISE EXCEPTION 'closed exchange should refuse messages';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'EXCHANGE_CLOSED' THEN RAISE; END IF; END;
  INSERT INTO t VALUES ('X', x::text);
  RAISE NOTICE 'ok 3: exchange % closed with bundle', x;
END $$;

-- 4. Publish: the card carries pseudonyms and a paraphrase, never the words.
DO $$ DECLARE x UUID := (SELECT v FROM t WHERE k='X')::uuid; pid UUID; card JSONB;
BEGIN
  card := jsonb_build_object(
    'pseudonyms', jsonb_build_array((SELECT v FROM t WHERE k='A_handle'), (SELECT v FROM t WHERE k='B_handle')),
    'emotion', 'Sad', 'color', 'blue', 'paraphrase', 'שניים נזכרים בקו חוף שקט ובהבטחה להתחיל שוב.',
    'seed', 'two figures, still water, dusk', 'intensity', 1.2, 'confidence', 0.9,
    'provenance', jsonb_build_object('exchangeId', x, 'consentVersion', 'exhibit-consent-1', 'redactionRemoved', 2));
  pid := public.publish_post(card);
  INSERT INTO t VALUES ('P', pid::text);
  IF (SELECT status FROM public.exchanges WHERE id = x) <> 'published' THEN RAISE EXCEPTION 'exchange should be published'; END IF;
  IF (SELECT emotion || '/' || color FROM public.posts WHERE id = pid) <> 'sad/blue' THEN RAISE EXCEPTION 'post state should be normalized sad/blue'; END IF;
  IF (SELECT memory[1 + 4*8 + 4] FROM public.posts WHERE id = pid) <> 3 THEN RAISE EXCEPTION 'initial memory weight should be 3'; END IF;
  BEGIN PERFORM public.publish_post(card - 'paraphrase'); RAISE EXCEPTION 'card without paraphrase should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'INVALID_CARD%' THEN RAISE; END IF; END;
  RAISE NOTICE 'ok 4: published %', pid;
END $$;

-- 5. Reactions: memory gives the post inertia; three opposite triggers move it one step.
DO $$ DECLARE p UUID := (SELECT v FROM t WHERE k='P')::uuid; r JSONB; st TEXT;
BEGIN
  r := public.react_to_post(p, 'trigger', 'joy', 'yellow');
  st := (SELECT emotion || '/' || color FROM public.posts WHERE id = p);
  IF st <> 'sad/blue' THEN RAISE EXCEPTION 'one trigger should not flip a post with publish weight 3 (got %)', st; END IF;
  r := public.react_to_post(p, 'trigger', 'joy', 'yellow');
  r := public.react_to_post(p, 'trigger', 'joy', 'yellow');
  st := (SELECT emotion || '/' || color FROM public.posts WHERE id = p);
  IF st <> 'disgust/pink' THEN RAISE EXCEPTION 'three triggers should move one step clockwise to disgust/pink (got %)', st; END IF;
  IF (r->'before'->>'emotion') <> 'sad' OR (r->'after'->>'emotion') <> 'disgust' THEN RAISE EXCEPTION 'reaction result should report before/after: %', r; END IF;
  IF (SELECT count(*) FROM public.comments WHERE post_id = p) <> 3 THEN RAISE EXCEPTION 'three comments expected'; END IF;
  IF (SELECT reactions FROM public.posts WHERE id = p) <> 3 THEN RAISE EXCEPTION 'reactions counter'; END IF;
  r := public.react_to_post(p, 'brace', 'sad', 'blue');
  IF (SELECT braces FROM public.posts WHERE id = p) <> 1 THEN RAISE EXCEPTION 'brace counter'; END IF;
  BEGIN PERFORM public.react_to_post(p, 'brace', 'sad', 'blue'); RAISE EXCEPTION 'second brace by same actor should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ALREADY_BRACED' THEN RAISE; END IF; END;
  RAISE NOTICE 'ok 5: reactions, state now %', st;
END $$;

-- 6. Feed: the declared state decides what is seen.
DO $$ DECLARE p UUID := (SELECT v FROM t WHERE k='P')::uuid; n INT;
BEGIN
  SELECT count(*) INTO n FROM public.get_feed('sad', 'blue') f WHERE f.id = p;
  IF n <> 1 THEN RAISE EXCEPTION 'sad/blue visitor should see the post'; END IF;
  SELECT count(*) INTO n FROM public.get_feed('joy', 'yellow') f WHERE f.id = p;
  IF n <> 0 THEN RAISE EXCEPTION 'joy/yellow visitor should not see a sad/blue post with pi=0'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_feed('sad','blue') f WHERE f.body LIKE '%חיפה%' OR f.body LIKE '%דנה%') THEN RAISE EXCEPTION 'words leaked to the wall'; END IF;
  RAISE NOTICE 'ok 6: feed filters by declared state';
END $$;

-- 7. Agents: key stored hashed, reacts under its own identity.
DO $$ DECLARE a UUID := (SELECT v FROM t WHERE k='A')::uuid; ag JSONB; p UUID := (SELECT v FROM t WHERE k='P')::uuid; r JSONB;
BEGIN
  ag := public.create_agent('זוכר', 'trust', 'lime', a);
  IF (ag->>'api_key') NOT LIKE 'em2_sk_%' THEN RAISE EXCEPTION 'agent key format'; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_keys WHERE key_hash = ag->>'api_key') THEN RAISE EXCEPTION 'key stored in clear'; END IF;
  r := public.react_to_post(p, 'trigger', 'trust', 'lime', NULL, ag->>'api_key');
  IF (SELECT actor_profile FROM public.comments WHERE post_id = p ORDER BY id DESC LIMIT 1) <> (ag->>'agent_id')::uuid THEN RAISE EXCEPTION 'agent reaction should carry agent profile'; END IF;
  BEGIN PERFORM public.react_to_post(p, 'trigger', 'trust', 'lime', NULL, 'em2_sk_wrong'); RAISE EXCEPTION 'wrong key should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'UNAUTHENTICATED%' THEN RAISE; END IF; END;
  RAISE NOTICE 'ok 7: agent % reacted', ag->>'handle';
END $$;

-- 8. Withdrawal: a participant pulls the post; a stranger cannot.
DO $$ DECLARE p UUID := (SELECT v FROM t WHERE k='P')::uuid; a UUID := (SELECT v FROM t WHERE k='A')::uuid; n INT;
BEGIN
  BEGIN PERFORM public.withdraw_post(p, gen_random_uuid()); RAISE EXCEPTION 'stranger should not withdraw';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF; END;
  IF NOT public.withdraw_post(p, a) THEN RAISE EXCEPTION 'withdraw should succeed'; END IF;
  SELECT count(*) INTO n FROM public.get_feed('sad', 'blue') f WHERE f.id = p;
  IF n <> 0 THEN RAISE EXCEPTION 'withdrawn post still in feed'; END IF;
  IF (SELECT body FROM public.posts WHERE id = p) <> '' THEN RAISE EXCEPTION 'withdrawn post should lose its body'; END IF;
  IF (SELECT status FROM public.exchanges WHERE id = (SELECT v FROM t WHERE k='X')::uuid) <> 'withdrawn' THEN RAISE EXCEPTION 'exchange should be withdrawn'; END IF;
  RAISE NOTICE 'ok 8: withdrawn';
END $$;

-- 9. RLS: anon reads the wall, never the words.
DO $$ DECLARE n INT;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.posts;                -- allowed (withdrawn hidden by policy)
  IF n <> 0 THEN RAISE EXCEPTION 'anon should see no live posts after withdrawal, saw %', n; END IF;
  BEGIN
    PERFORM count(*) FROM public.messages;
    RAISE EXCEPTION 'anon must not read messages';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM count(*) FROM public.profiles;
    RAISE EXCEPTION 'anon must not read profiles directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM count(*) FROM public.public_profiles;            -- allowed
  BEGIN
    PERFORM public.publish_post('{}'::jsonb);
    RAISE EXCEPTION 'anon must not publish';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  RAISE NOTICE 'ok 9: rls';
END $$;

-- 10. Audit log holds ids, not words.
DO $$ DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.audit_log;
  IF n < 8 THEN RAISE EXCEPTION 'audit log too short: %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.audit_log WHERE action LIKE '%חיפה%' OR target LIKE '%חיפה%' OR COALESCE(actor,'') LIKE '%חיפה%') THEN RAISE EXCEPTION 'audit log leaked content'; END IF;
  RAISE NOTICE 'ok 10: audit (% rows)', n;
END $$;

-- 11. A signed-in human: claims from the web, sets home, preferences, agents, leaves.
DO $$ DECLARE uid UUID := gen_random_uuid(); inv JSONB; me JSONB; ag JSONB; n INT;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (uid, 'web@example.test');
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  inv := public.create_invite('רות', 'investor', 'amplifier_shapes');
  me := public.claim_invite(inv->>'code');
  IF public.my_profile_id() <> (me->>'profile_id')::uuid THEN RAISE EXCEPTION 'my_profile_id should resolve the claimer'; END IF;
  PERFORM public.set_home('trust', 'lime');
  IF (SELECT base_emotion FROM public.profiles WHERE id = public.my_profile_id()) <> 'trust' THEN RAISE EXCEPTION 'set_home'; END IF;
  PERFORM public.update_preferences('comic', 'anyone');
  IF (SELECT style FROM public.profiles WHERE id = public.my_profile_id()) <> 'comic' THEN RAISE EXCEPTION 'update_preferences'; END IF;
  BEGIN PERFORM public.update_preferences('oil', NULL); RAISE EXCEPTION 'bad style should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'INVALID_STYLE' THEN RAISE; END IF; END;
  ag := public.create_agent('מגיב', 'joy', 'yellow');
  SELECT count(*) INTO n FROM public.my_agents(); IF n <> 1 THEN RAISE EXCEPTION 'my_agents should list one'; END IF;
  PERFORM public.revoke_agent_key((ag->>'agent_id')::uuid);
  IF NOT (SELECT revoked FROM public.my_agents() LIMIT 1) THEN RAISE EXCEPTION 'revoke'; END IF;
  IF NOT public.delete_my_profile() THEN RAISE EXCEPTION 'delete_my_profile'; END IF;
  IF public.my_profile_id() IS NOT NULL THEN RAISE EXCEPTION 'profile should be gone'; END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  RAISE NOTICE 'ok 11: me';
END $$;

-- 12. Nobody acts as someone else: a signed-in user naming another profile is refused
--     everywhere; the service role (the Worker) may name one.
DO $$ DECLARE victim UUID; attacker UUID := gen_random_uuid(); inv JSONB; post UUID; x UUID; msg TEXT; f TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  inv := public.create_invite('נגה', 'participant', 'trust_signal');
  victim := (public.claim_invite(inv->>'code', 9001)->>'profile_id')::uuid;
  INSERT INTO auth.users(id, email) VALUES (attacker, 'attacker@example.test');

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', attacker)::text, true);
  PERFORM set_config('request.jwt.claim.sub', attacker::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  FOREACH f IN ARRAY ARRAY['record_consent', 'set_home', 'set_state', 'withdraw_post', 'create_agent', 'create_pair_invite', 'stop_profile', 'declare_state', 'claim_invite'] LOOP
    BEGIN
      CASE f
        WHEN 'record_consent' THEN PERFORM public.record_consent(victim);
        WHEN 'set_home' THEN PERFORM public.set_home('angry', 'red', victim);
        WHEN 'set_state' THEN PERFORM public.set_state('angry', 'red', false, victim);
        WHEN 'withdraw_post' THEN PERFORM public.withdraw_post(gen_random_uuid(), victim);
        WHEN 'create_agent' THEN PERFORM public.create_agent('שתול', 'joy', 'yellow', victim);
        WHEN 'create_pair_invite' THEN PERFORM public.create_pair_invite(victim);
        WHEN 'stop_profile' THEN PERFORM public.stop_profile(victim);
        WHEN 'declare_state' THEN PERFORM public.declare_state(victim, 'angry', 'red');
        WHEN 'claim_invite' THEN PERFORM public.claim_invite(public.create_invite('זר', 'participant', 'trust_signal')->>'code', 9001);
      END CASE;
      RAISE EXCEPTION 'impersonation through % should be refused', f;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'FORBIDDEN%' THEN RAISE EXCEPTION '% refused with % instead of FORBIDDEN', f, SQLERRM; END IF;
    END;
  END LOOP;
  IF (SELECT consent_at FROM public.profiles WHERE id = victim) IS NOT NULL THEN RAISE EXCEPTION 'consent was forged'; END IF;
  IF (SELECT stopped_at FROM public.profiles WHERE id = victim) IS NOT NULL THEN RAISE EXCEPTION 'victim was stopped'; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM public.record_consent(victim);
  IF (SELECT consent_at FROM public.profiles WHERE id = victim) IS NULL THEN RAISE EXCEPTION 'the service role should record consent'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'ok 12: no impersonation';
END $$;

-- 13. Declaring a state in the bot: one part at a time, both stamped, reset asks again.
DO $$ DECLARE p UUID; r JSONB; inv JSONB;
BEGIN
  inv := public.create_invite('עמית', 'participant', 'amplifier_shapes');
  p := (public.claim_invite(inv->>'code', 9101)->>'profile_id')::uuid;
  r := public.declare_state(p, 'trust');
  IF NOT (r->>'emotionDeclared')::boolean OR (r->>'colorDeclared')::boolean THEN RAISE EXCEPTION 'emotion only: %', r; END IF;
  r := public.declare_state(p, NULL, 'Lime');
  IF r->>'emotion' <> 'trust' OR r->>'color' <> 'lime' OR NOT (r->>'colorDeclared')::boolean THEN RAISE EXCEPTION 'both: %', r; END IF;
  IF (SELECT emotion || '/' || color FROM public.public_profiles WHERE id = p) <> 'trust/lime' THEN RAISE EXCEPTION 'expressed state not public'; END IF;
  BEGIN PERFORM public.declare_state(p, 'calm'); RAISE EXCEPTION 'unknown emotion should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'INVALID_STATE%' THEN RAISE; END IF; END;
  r := public.declare_state(p, p_reset => true);
  IF (r->>'emotionDeclared')::boolean OR (r->>'colorDeclared')::boolean THEN RAISE EXCEPTION 'reset should clear: %', r; END IF;
  IF r->>'emotion' <> 'trust' THEN RAISE EXCEPTION 'reset keeps the last state until a new answer'; END IF;
  RAISE NOTICE 'ok 13: declare_state';
END $$;

ROLLBACK;
\echo smoke: all blocks passed
