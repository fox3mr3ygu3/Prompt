-- Token-bucket rate limiter (R11) — DDIA-from-scratch component.
--
-- Storage: one Redis hash per key { tokens, last_refill_ms }.
-- Atomicity: a single Lua script `RATE_LIMIT_LUA` runs server-side in Redis,
-- so the read-modify-write of (tokens, last_refill_ms) is atomic across
-- multiple nginx workers and replicas.
--
-- Behavior: falls *open* (allow + log + counter) if Redis is unreachable.
-- This is a deliberate availability trade-off documented in ADR-002.

local resty_redis = require "resty.redis"

local _M = {}

local RATE_LIMIT_LUA = [[
local key   = KEYS[1]
local rate  = tonumber(ARGV[1])     -- tokens / second
local burst = tonumber(ARGV[2])     -- max bucket
local now   = tonumber(ARGV[3])     -- ms since epoch
local cost  = tonumber(ARGV[4])     -- per-request cost

local data = redis.call("HMGET", key, "tokens", "last")
local tokens = tonumber(data[1])
local last   = tonumber(data[2])

if tokens == nil then
  tokens = burst
  last   = now
end

local elapsed = math.max(0, now - last) / 1000.0
tokens = math.min(burst, tokens + elapsed * rate)

if tokens < cost then
  redis.call("HMSET", key, "tokens", tokens, "last", now)
  redis.call("PEXPIRE", key, math.ceil((burst / rate) * 1000) + 5000)
  return 0
end

tokens = tokens - cost
redis.call("HMSET", key, "tokens", tokens, "last", now)
redis.call("PEXPIRE", key, math.ceil((burst / rate) * 1000) + 5000)
return 1
]]

local function fail_open(reason)
  -- Increment a shared counter so we can alert. Allow the request through.
  local sd = ngx.shared.ratelimit_state
  if sd then
    sd:incr("fail_open_total", 1, 0)
  end
  ngx.log(ngx.WARN, "rate-limiter fail-open: " .. (reason or "unknown"))
end

function _M.check(opts)
  local key   = "rl:" .. (opts.key or ngx.var.remote_addr)
  local rate  = opts.rate or 20
  local burst = opts.burst or (rate * 2)
  local cost  = opts.cost or 1

  local red = resty_redis:new()
  red:set_timeouts(150, 150, 150)  -- connect, send, read

  local host = os.getenv("REDIS_HOST") or "redis"
  local port = tonumber(os.getenv("REDIS_PORT") or "6379")
  local ok, err = red:connect(host, port)
  if not ok then
    return fail_open("connect: " .. (err or "?"))
  end

  local now_ms = ngx.now() * 1000
  local res, err2 = red:eval(RATE_LIMIT_LUA, 1, key, rate, burst, now_ms, cost)
  if not res then
    fail_open("eval: " .. (err2 or "?"))
    red:close()
    return
  end

  -- Return the connection to the pool for reuse.
  red:set_keepalive(10000, 100)

  if tonumber(res) ~= 1 then
    ngx.header["Retry-After"] = "1"
    return ngx.exit(429)
  end
end

return _M
