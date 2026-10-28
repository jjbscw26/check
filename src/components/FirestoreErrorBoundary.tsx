import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface FirestoreErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class FirestoreErrorBoundary extends React.Component<
  { children: React.ReactNode },
  FirestoreErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): FirestoreErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Error inesperado al comunicar con Firestore.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('FirestoreErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let friendlyDetail = this.state.errorMessage;
      let isFirestoreStructuredError = false;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && typeof parsed.error === 'string') {
          isFirestoreStructuredError = true;
          friendlyDetail = parsed.error.includes('Quota exceeded')
            ? 'Se alcanzó el límite diario gratuito de Firestore. La cuota se restablecerá mañana.'
            : `Operación "${parsed.operationType}" rechazada en "${parsed.path}": ${parsed.error}`;
        }
      } catch {
        // Keep raw message if not JSON
      }

      return (
        <div className="max-w-3xl mx-auto my-8 p-6 bg-white border border-red-200 rounded-xl shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {isFirestoreStructuredError
                  ? 'Error de permisos o conexión con Firestore'
                  : 'Ocurrió un problema inesperado al mostrar esta sección'}
              </h3>
              <p className="text-sm text-slate-600 break-words">{friendlyDetail}</p>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
