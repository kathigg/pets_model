const DEFAULT_DAILY_LIMIT = 100;

function dailyLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 10000 ? limit : DEFAULT_DAILY_LIMIT;
}

/** One SQLite-backed Durable Object enforces a shared daily model-call ceiling. */
export class ModelBudget {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/reserve') {
      return new Response(null, { status: 404 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const limit = dailyLimit(this.env.DAILY_MODEL_LIMIT);
    const allowed = await this.ctx.storage.transaction(async storage => {
      const current = await storage.get('daily');
      const count = current?.day === today ? current.count : 0;
      if (count >= limit) return false;
      await storage.put('daily', { day: today, count: count + 1 });
      return true;
    });
    return new Response(null, { status: allowed ? 204 : 429 });
  }
}
