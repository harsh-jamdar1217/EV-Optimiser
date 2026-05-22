exports.aiPlaceholder = async (req, res) => {
  return res.json({ ok: true, route: 'ai', action: 'gemini', received: req.body || null, note: 'AI integration placeholder' });
};

