-- 003: push line ends "Stop by!" instead of "Stop by."
-- Patches the two functions that build the push body (specials_check for the
-- preview, dispatch_special for the real send) in place, without re-pasting
-- their full definitions.

do $$
declare d text;
begin
  for d in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('specials_check', 'dispatch_special')
      and p.prokind = 'f'
  loop
    execute replace(d, ''' Stop by.''', ''' Stop by!''');
  end loop;
end $$;

-- Verify: both rows should show 1 (or more), none should mention "Stop by."
select p.proname,
       (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'Stop by!', ''))) / length('Stop by!') as bang_count,
       position('Stop by.' in pg_get_functiondef(p.oid)) as leftover_dot
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('specials_check', 'dispatch_special')
  and p.prokind = 'f';
