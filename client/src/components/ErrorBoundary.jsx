import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 font-bold">
                ⚠️
              </span>
              <div>
                <h2 className="text-xl font-bold text-red-400">Application Error</h2>
                <p className="text-xs text-slate-400">EV Optimizer encountered a rendering crash</p>
              </div>
            </div>
            
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              An unhandled crash happened in the client component tree. Here are the error details:
            </p>
            
            <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-auto max-h-60 text-xs font-mono text-red-300">
              <div className="font-semibold">{this.state.error && this.state.error.toString()}</div>
              {this.state.error && this.state.error.stack && (
                <pre className="mt-2 text-slate-400 whitespace-pre-wrap text-[10px] leading-normal">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-400 text-white py-3 font-semibold transition"
              >
                Clear Cache & Reload
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 font-semibold transition"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
