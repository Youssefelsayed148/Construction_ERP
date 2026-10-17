\pset pager off
SELECT clock_timestamp() AS snapshot_time, pid, state, wait_event_type, wait_event,
       xact_start, query_start, pg_blocking_pids(pid) AS blockers,
       regexp_replace(query, '''([^'']|'''')*''', '''[redacted]''', 'g') AS query
FROM pg_stat_activity WHERE datname = current_database();
SELECT locktype, database, relation, page, tuple, virtualxid, transactionid,
       classid, objid, objsubid, virtualtransaction, pid, mode, granted, fastpath
FROM pg_locks ORDER BY pid, locktype, granted;
