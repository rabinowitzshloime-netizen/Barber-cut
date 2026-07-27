// api/tryon.js
const FAL_SUBMIT = "https://queue.fal.run/fal-ai/flux-pro/kontext";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const KEY = process.env.FAL_KEY;
  if (!KEY) return res.status(500).json({ error: "FAL_KEY missing in Vercel env vars." });

  try {
    const body = req.body || {};
    const image = body.image;
    const desc = (body.prompt || "").toString().trim();
    if (!image || !desc) return res.status(400).json({ error: "Need a photo and a description." });

    /* Only mention beard if the client actually asked for it */
    const wantsBeard = /beard|facial hair|moustache|mustache|stubble|goatee|sideburn/i.test(desc);

    const prompt = wantsBeard
      ? "Change only the hair and beard of the person in this photo to match this style: " +
        desc +
        ". Keep the exact same face, skin tone, lighting, camera angle and background. Make it photorealistic and natural-looking."
      : "Change only the hair of the person in this photo to match this style: " +
        desc +
        ". Do not add, change, or remove any facial hair or beard — leave it exactly as it is. " +
        "Keep the exact same face, skin tone, lighting, camera angle and background. Make it photorealistic and natural-looking.";

    const auth = { "Authorization": "Key " + KEY, "Content-Type": "application/json" };

    const submit = await fetch(FAL_SUBMIT, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ prompt: prompt, image_url: image })
    });
    const submitText = await submit.text();
    let job = {};
    try { job = JSON.parse(submitText); } catch (_) {}

    if (!submit.ok) {
      return res.status(502).json({
        error: "fal.ai said: " + submit.status + " — " + submitText.slice(0, 400)
      });
    }

    const statusUrl = job.status_url;
    const resultUrl = job.response_url;
    if (!statusUrl || !resultUrl) {
      return res.status(502).json({ error: "No job URLs in reply: " + submitText.slice(0, 300) });
    }

    let finished = false;
    let lastStatus = "";
    for (let i = 0; i < 30 && !finished; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const s = await fetch(statusUrl, { headers: { "Authorization": "Key " + KEY } });
      const sj = await s.json().catch(() => ({}));
      lastStatus = sj.status || "?";
      if (lastStatus === "COMPLETED") finished = true;
      else if (lastStatus === "FAILED" || lastStatus === "ERROR") {
        return res.status(502).json({ error: "fal.ai failed: " + JSON.stringify(sj).slice(0, 400) });
      }
    }
    if (!finished) return res.status(504).json({ error: "Preview took too long. Last status: " + lastStatus });

    const out = await fetch(resultUrl, { headers: { "Authorization": "Key " + KEY } });
    const oj = await out.json().catch(() => ({}));
    const url = oj && oj.images && oj.images[0] && oj.images[0].url;
    if (!url) return res.status(502).json({ error: "No image url in result: " + JSON.stringify(oj).slice(0, 300) });

    return res.status(200).json({ url: url });
  } catch (e) {
    return res.status(500).json({ error: "Server crashed: " + (e && e.message ? e.message : String(e)) });
  }
};
