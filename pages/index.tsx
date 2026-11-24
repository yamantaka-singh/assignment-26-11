import { Component, type ReactNode } from 'react';
import '../src/ui/theme.css';
import '../src/booking/booking.css';
import { App } from '../src/App';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SafeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: unknown) {
    console.error('[SharadUtsav] Error caught by boundary:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, margin: '20px auto', maxWidth: 600, background: '#fff3cd', color: '#856404', borderRadius: 8, border: '1px solid #ffeeba' }}>
          <h3>Unable to display this step</h3>
          <p>An unexpected display error occurred. Please refresh the page.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', background: '#c2571a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function HomePage() {
  return (
    <SafeErrorBoundary>
      <App />
    </SafeErrorBoundary>
  );
}
