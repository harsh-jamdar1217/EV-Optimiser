exports.reportPlaceholder = async (req, res) => {
  return res.json({ ok: true, route: 'report', action: 'generate', received: req.body || null, note: 'jsPDF report placeholder' });
};

