"use client"

import { useState, useEffect } from 'react';
import { X, Monitor, Tablet, Smartphone, Loader2, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export type PreviewMode = 'desktop' | 'tablet' | 'mobile';

export const PREVIEW_DIMENSIONS = {
  desktop: { width: 600, height: 600 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
} as const;

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  mjml: string | null;
  plainText: string | null;
  subject: string | null;
  isLoading: boolean;
  error: string | null;
}

export function PreviewModal({
  isOpen,
  onClose,
  mjml,
  plainText,
  subject,
  isLoading,
  error,
}: PreviewModalProps) {
  const [viewMode, setViewMode] = useState<PreviewMode>('desktop');
  const [compiledHtml, setCompiledHtml] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  // Compile MJML to HTML when mjml changes
  useEffect(() => {
    if (!mjml) {
      setCompiledHtml(null);
      return;
    }

    async function compileMjml() {
      try {
        // Dynamic import mjml-browser
        const mjml2html = (await import('mjml-browser')).default;
        const result = mjml2html(mjml as string);
        
        if (result.errors && result.errors.length > 0) {
          console.warn('MJML warnings:', result.errors);
        }
        
        setCompiledHtml(result.html);
        setCompileError(null);
      } catch (err) {
        console.error('MJML compile error:', err);
        setCompileError('Failed to compile email template');
        setCompiledHtml(null);
      }
    }

    compileMjml();
  }, [mjml]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0 border-b border-ora-sand">
          <div className="flex items-center justify-between">
            <CardTitle>Email Preview</CardTitle>
            <div className="flex items-center gap-4">
              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-ora-cream rounded-lg p-1">
                <button
                  onClick={() => setViewMode('desktop')}
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                    ${viewMode === 'desktop'
                      ? 'bg-ora-white shadow text-ora-charcoal'
                      : 'text-ora-graphite hover:text-ora-charcoal'
                    }
                  `}
                  title="Desktop preview (600px)"
                >
                  <Monitor className="h-4 w-4" />
                  Desktop
                </button>
                <button
                  onClick={() => setViewMode('tablet')}
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                    ${viewMode === 'tablet'
                      ? 'bg-ora-white shadow text-ora-charcoal'
                      : 'text-ora-graphite hover:text-ora-charcoal'
                    }
                  `}
                  title="Tablet preview (768px)"
                >
                  <Tablet className="h-4 w-4" />
                  Tablet
                </button>
                <button
                  onClick={() => setViewMode('mobile')}
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                    ${viewMode === 'mobile'
                      ? 'bg-ora-white shadow text-ora-charcoal'
                      : 'text-ora-graphite hover:text-ora-charcoal'
                    }
                  `}
                  title="Mobile preview (375px)"
                >
                  <Smartphone className="h-4 w-4" />
                  Mobile
                </button>
              </div>
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {subject && (
            <p className="text-sm text-ora-graphite mt-2">
              <span className="font-medium">Subject:</span> {subject}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-6 bg-ora-cream/50">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-ora-gold mb-4" />
              <p className="text-ora-graphite">Generating preview...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-8 w-8 text-red-500 mb-4" />
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {compileError && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-8 w-8 text-red-500 mb-4" />
              <p className="text-red-600">{compileError}</p>
            </div>
          )}

          {compiledHtml && !isLoading && !error && !compileError && (
            <div className="flex justify-center">
              <div
                className={`
                  bg-white shadow-lg rounded-lg overflow-hidden transition-all duration-300
                `}
                style={{
                  width: viewMode === 'desktop' 
                    ? '100%' 
                    : `${PREVIEW_DIMENSIONS[viewMode].width}px`,
                  maxWidth: `${PREVIEW_DIMENSIONS.desktop.width}px`,
                }}
              >
                <iframe
                  srcDoc={compiledHtml}
                  title="Email Preview"
                  className="w-full border-0"
                  style={{
                    height: `${PREVIEW_DIMENSIONS[viewMode].height}px`,
                  }}
                />
              </div>
            </div>
          )}

          {!compiledHtml && !isLoading && !error && !compileError && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-ora-graphite">No preview available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
