export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image, prompt } = req.body || {};
  if (!image || !prompt) return res.status(400).json({ error: 'Missing image or prompt' });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: 'FAL_KEY not set' });

  // Detect if the client asked to change any facial features
  const wantsBeardChange   = /beard|facial hair|moustache|mustache|stubble|goatee|sideburn/i.test(prompt);
  const wantsSkinChange    = /skin tone|lighten|darken|complexion/i.test(prompt);
  const wantsEyebrowChange = /eyebrow|brow/i.test(prompt);

  const preserveNote =
    (!wantsBeardChange   ? ' Keep the beard, stubble, and all facial hair exactly as in the photo — do not remove, add, or alter it.' : '') +
    (!wantsSkinChange    ? ' Keep the skin tone and complexion exactly as in the photo — do not change it at all.' : '') +
    (!wantsEyebrowChange ? ' Keep the eyebrows exactly as in the photo.' : '');

  const fullPrompt =
    `Change only the hairstyle of the person in this photo to: ${prompt}.` +
    ` CRITICAL: This must look like the same real person — keep their face shape, facial features, eyes, nose, mouth, ears, and identity completely unchanged.` +
    ` Only the hair on top of the head should change. The result must look like a real photograph.` +
    preserveNote;

  try {
    // Submit request to fal.ai queue
    const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-kontext/requests', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: image,
        prompt: fullPrompt,
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      return res.status(502).json({ error: 'fal.ai submit failed: ' + err });
    }

    const { request_id } = await submitRes.json();

    // Poll for result (up to 90 seconds)
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://queue.fal.run/fal-ai/flux-kontext/requests/${request_id}`, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
      });
      if (!pollRes.ok) continue;
      const data = await pollRes.json();
      if (data.status === 'COMPLETED') {
        const url = data.output?.images?.[0]?.url || data.output?.image?.url;
        if (url) return res.status(200).json({ url });
        return res.status(502).json({ error: 'No image in response' });
      }
      if (data.status === 'FAILED') {
        return res.status(502).json({ error: 'fal.ai generation failed' });
      }
    }

    return res.status(504).json({ error: 'Timed out waiting for preview' });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
