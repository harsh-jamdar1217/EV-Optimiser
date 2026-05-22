exports.createProfilePlaceholder = async (req, res) => {
  return res.json({ ok: true, route: 'evProfile', action: 'createProfile', received: req.body || null });
};

exports.getProfilePlaceholder = async (req, res) => {
  return res.json({ ok: true, route: 'evProfile', action: 'getProfile', id: req.params.id });
};

