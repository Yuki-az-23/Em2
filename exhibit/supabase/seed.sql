-- A seeded wall for the local demo: twelve cards spread over the wheel, with a
-- few triggers and braces from distinct simulated visitors. Runs once per
-- database; marked provenance.seed = 'demo'. Never apply it in production.
DO $$
DECLARE
  cards CONSTANT JSONB := '[
    ["joy","yellow","זוג החליף 9 הודעות. המכונה רשמה התלהבות שנשמעה כמו התחלה."],
    ["trust","lime","שתי הודעות ארוכות ושקט ארוך אחריהן. המגביר קרא בזה אמון."],
    ["feared","green","הקצב עלה ואז נעצר. המערכת סימנה חשש ולא ידעה ממה."],
    ["surprised","aqua","הודעה אחת קצרה שינתה את כל הקצב. האלגוריתם קרא לזה הפתעה."],
    ["sad","blue","שיחה של 14 הודעות שהלכו והתקצרו. המכונה החליטה שזה עצב."],
    ["disgust","pink","שני אנשים חזרו על אותה מילה. המערכת סיווגה את זה כדחייה."],
    ["angry","red","תשובות מהירות ומעט מילים. המגביר שמע כעס, אולי בטעות."],
    ["anticipated","orange","הרבה סימני שאלה ותשובה אחת. המכונה רשמה ציפייה."],
    ["trust","aqua","שיחה שקטה בלילה. המערכת לא שאלה למה, רק רשמה."],
    ["sad","pink","מישהו כתב הרבה ומישהו כתב מעט. האלגוריתם הכריע עצב."],
    ["joy","orange","שיחה קצרה שנגמרה מוקדם. המכונה החליטה שזה היה טוב."],
    ["feared","blue","הודעות שנמחקו ונכתבו שוב. המגביר רשם את ההיסוס כפחד."]
  ]';
  c JSONB; pid UUID; i INT := 0; v INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.posts WHERE provenance->>'seed' = 'demo') THEN RETURN; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(cards) LOOP
    i := i + 1;
    pid := public.publish_post(jsonb_build_object(
      'pseudonyms', jsonb_build_array(public.make_handle(), public.make_handle()),
      'emotion', c->>0, 'color', c->>1, 'paraphrase', c->>2,
      'seed', 'two figures, ' || (c->>0) || ', ' || (c->>1) || ' light',
      'provenance', jsonb_build_object('seed', 'demo', 'model', 'demo-seed')));
    UPDATE public.posts SET created_at = NOW() - make_interval(hours => i * 3) WHERE id = pid;
    -- a few strangers react, each from their own simulated address
    FOR v IN 1..(i % 4) LOOP
      PERFORM set_config('request.headers', json_build_object('x-forwarded-for', '10.77.' || i || '.' || v)::text, true);
      PERFORM public.react_to_post(pid, CASE WHEN v % 2 = 0 THEN 'brace' ELSE 'trigger' END,
        (public.ring_names('emotion'))[1 + (i + v) % 8], (public.ring_names('color'))[1 + (i * v) % 8]);
    END LOOP;
  END LOOP;
  PERFORM set_config('request.headers', '', true);
END $$;
