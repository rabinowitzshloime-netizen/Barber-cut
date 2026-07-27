// api/tryon.js
// This runs on Vercel (not in the browser) so your secret key stays hidden.

const FAL_SUBMIT = "https://queue.fal.run/fal-ai/flux-pro/kontext";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  const KEY = process.env.FAL_KEY;
  if (!KEY) {
    return res.status(500).json({ error: "Preview isn't switched on yet." });
  }

  try {
    const body = req.body || {};
    const image = body.image;
    const desc = (body.prompt || "").toString().trim();

    if (!image || !desc) {
      return res.status(400).json({ error: "Need a photo and a description." });
    }

    const prompt =
      "Change only the hair and beard of the person in this photo to this style: " +
      desc +
      ". Keep the exact same face, skin tone, lighting, camera angle and " +
      "background. Make it photorealistic and natural-looking.";

    const auth = { "Authorization": "Key " + KEY, "Content-Type": "application/json" };

    const submit = await fetch(FAL_SUBMIT, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ prompt: prompt, image_url: image })
    });
    const job = await submit.json().catch(() => ({}));
    if (!submit.ok) {
      return res.status(502).json({ error: "Preview service is busy. Try again." });
    }

    const statusUrl = job.status_url;
    const resultUrl = job.response_url;
    if (!statusUrl || !resultUrl) {
      return res.status(502).json({ error: "Preview service gave no job back." });
    }

    let finished = false;
    for (let i = 0; i < 30 && !finished; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const s = await fetch(statusUrl, { headers: { "Authorization": "Key " + KEY } });
      const sj = await s.json().catch(() => ({}));
      if (sj.status === "COMPLETED") finished = true;
      else if (sj.status === "FAILED" || sj.status === "ERROR") {
        return res.status(502).json({ error: "Couldn't make that one — try a clearer, front-facing selfie." });
      }
    }
    if (!finished) {
      return res.status(504).json({ error: "Preview took too long. Please try again." });
    }

    const out = await fetch(resultUrl, { headers: { "Authorization": "Key " + KEY } });
    const oj = await out.json().catch(() => ({}));
    const url = oj && oj.images && oj.images[0] && oj.images[0].url;
    if (!url) {
      return res.status(502).json({ error: "No picture came back. Try again." });
    }

    return res.status(200).json({ url: url });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong making the preview." });
  }
};
