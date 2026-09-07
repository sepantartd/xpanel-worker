// XPanel Worker — مرحله ۱: تست سلامت + تست KV
export default {
  async fetch(req, env) {
    // تست نوشتن و خواندن از KV
    await env.KV.put('ping', 'pong-' + Date.now());
    const value = await env.KV.get('ping');

    return new Response(JSON.stringify({
      project: 'xpanel-worker',
      status: 'ok',
      step: 1,
      kv_test: value,
      time: new Date().toISOString(),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
