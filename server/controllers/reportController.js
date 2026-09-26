const { supabase } = require('../db');

exports.generateReportData = async (req, res) => {
  try {
    const { profile_id } = req.body;

    if (!profile_id) {
      return res.status(400).json({ ok: false, message: 'Active EV profile ID is required.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, message: 'EV profile not found in database.' });
    }

    const { data: allResults, error: resultsError } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false });

    if (resultsError) throw resultsError;

    // Keep only the most recent result per analysis_type
    const latestByType = {};
    (allResults || []).forEach((r) => {
      if (!latestByType[r.analysis_type]) {
        latestByType[r.analysis_type] = { result: r.result_json, created_at: r.created_at };
      }
    });

    return res.json({
      ok: true,
      data: {
        profile,
        generatedAt: new Date().toISOString(),
        modules: latestByType, // keys: performance, ai_recommendation, digital_twin, etc.
      },
    });
  } catch (error) {
    console.error('generateReportData error:', error);
    return res.status(500).json({ ok: false, message: 'Server error generating report data.' });
  }
};