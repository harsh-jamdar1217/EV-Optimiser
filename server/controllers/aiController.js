const { supabase } = require('../db');

exports.getRecommendations = async (req, res) => {
  try {
    const { profile_id } = req.body;

    if (!profile_id) {
      return res.status(400).json({ ok: false, message: 'Active EV profile ID is required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ ok: false, message: 'GEMINI_API_KEY is not configured on the server.' });
    }

    // 1. Fetch the EV profile
    const { data: profile, error: profileError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, message: 'EV profile not found in database.' });
    }

    // 2. Fetch the most recent analysis results of each type for context
    const { data: recentResults, error: resultsError } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (resultsError) throw resultsError;

    // Group latest result per analysis_type
    const latestByType = {};
    (recentResults || []).forEach((r) => {
      if (!latestByType[r.analysis_type]) latestByType[r.analysis_type] = r.result_json;
    });

    // 3. Build the prompt
    const prompt = `
You are an EV battery and efficiency consultant. Based on the following vehicle profile and analysis data, give the driver 4-6 short, specific, actionable recommendations to improve battery health, range, and cost efficiency.

Vehicle Profile:
${JSON.stringify(profile, null, 2)}

Recent Analysis Data:
${JSON.stringify(latestByType, null, 2)}

Respond ONLY with valid JSON in this exact shape, no markdown formatting, no code fences, no extra text:
{
  "summary": "one sentence overall assessment",
  "recommendations": [
    { "title": "short title", "detail": "one to two sentence explanation", "priority": "high" | "medium" | "low" }
  ]
}
`.trim();

    // 4. Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ ok: false, message: 'AI service failed to respond.' });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 5. Parse JSON out of the response (strip accidental code fences just in case)
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON:', rawText);
      return res.status(502).json({ ok: false, message: 'AI response was not valid JSON.' });
    }

    // 6. Save to analysis_results for history/dashboard reuse
    const { error: insertError } = await supabase.from('analysis_results').insert({
      profile_id,
      analysis_type: 'ai_recommendation',
      result_json: parsed,
    });
    if (insertError) console.error('Failed to save AI recommendation:', insertError);

    return res.json({ ok: true, data: parsed });
  } catch (error) {
    console.error('AI recommendation error:', error);
    return res.status(500).json({ ok: false, message: 'Server error generating AI recommendations.' });
  }
};