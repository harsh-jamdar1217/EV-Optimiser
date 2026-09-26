import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { api } from '../api/api';
import { getActiveProfile } from '../utils/activeProfile';

export default function Reports() {
  const navigate = useNavigate();
  const [activeProfile] = useState(() => getActiveProfile());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef(null);

  const handleGenerate = async () => {
    if (!activeProfile?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/report/generate', { profile_id: activeProfile.id });
      setReport(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
      });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`ev-optimizer-report-${activeProfile.vehicle_model || 'vehicle'}.pdf`);
    } catch (err) {
      console.error(err);
      setError('Failed to generate PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const renderSection = (title, data, keys) => {
    if (!data) return null;
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-3">{title}</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {keys.map(([label, key]) => (
            data.result?.[key] !== undefined && (
              <div key={key} className="flex justify-between border-b border-slate-700/50 pb-1.5">
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-white">{String(data.result[key])}</span>
              </div>
            )
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">FR-09</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">Reports</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Generate a complete summary of your vehicle's performance, battery, range, cost, and AI insights — downloadable as a PDF.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
      )}

      {!activeProfile ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/20 p-12 text-center max-w-3xl mx-auto flex flex-col items-center">
          <h2 className="text-2xl font-bold text-white">No active vehicle profile selected</h2>
          <button
            onClick={() => navigate('/ev-profile')}
            className="mt-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition"
          >
            Create / Manage Profiles
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-xl bg-blue-500 px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            {report && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="rounded-xl bg-emerald-500 px-6 py-3 font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {downloading ? 'Preparing PDF...' : 'Download as PDF'}
              </button>
            )}
          </div>

          {report && (
            <div ref={reportRef} className="space-y-6 bg-slate-950 p-6 rounded-2xl">
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
                <h2 className="text-2xl font-bold text-white">{report.profile.vehicle_model}</h2>
                <p className="text-sm text-slate-300 mt-1">
                  Battery: {report.profile.battery_capacity} kWh &middot; Motor: {report.profile.motor_power} kW &middot; Year: {report.profile.manufacturing_year}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Generated: {new Date(report.generatedAt).toLocaleString()}
                </p>
              </div>

              {renderSection('Performance', report.modules.performance, [
                ['Efficiency Score', 'efficiencyScore'],
                ['Estimated Range', 'estimatedRange'],
                ['Energy Consumption', 'energyConsumption'],
                ['Performance Score', 'performanceScore'],
              ])}

              {renderSection('Battery Health & Advice', report.modules.battery || report.modules.health, [
                ['Risk Level', 'riskLevel'],
                ['Expected Life Improvement', 'expectedLifeImprovement'],
              ])}

              {renderSection('Range Estimate', report.modules.range, [
                ['Estimated Range', 'estimatedRange'],
                ['Energy Consumption', 'energyConsumption'],
              ])}

              {renderSection('Cost Comparison', report.modules.cost, [
                ['Annual EV Cost', 'annualEvCost'],
                ['Annual Savings', 'annualSavings'],
                ['Break-even', 'breakEvenYears'],
                ['CO2 Saved (kg)', 'netCo2SavedKg'],
              ])}

              {renderSection('Degradation Forecast', report.modules.degradation, [
                ['Current SOH', 'currentSOH'],
                ['Baseline Lifespan (yrs)', 'baselineLifespan'],
                ['Optimized Lifespan (yrs)', 'optimizedLifespan'],
              ])}

              {report.modules.ai_recommendation && (
                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-3">AI Summary</h3>
                  <p className="text-sm text-slate-300">{report.modules.ai_recommendation.result.summary}</p>
                  <ul className="mt-4 space-y-2">
                    {report.modules.ai_recommendation.result.recommendations?.map((rec, i) => (
                      <li key={i} className="text-sm text-slate-300">
                        <span className="font-semibold text-white">{rec.title}:</span> {rec.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}