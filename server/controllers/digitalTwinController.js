exports.digitalTwinPlaceholder = async (req, res) => {
  return res.json({ ok: true, route: 'digitalTwin', action: 'simulate', received: req.body || null });
};

