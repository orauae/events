'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import EmailEditor, { EditorRef, EmailEditorProps } from 'react-email-editor';
import { AlertCircle, RefreshCw, Maximize2, Minimize2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  ORA_MERGE_TAGS,
  ORA_UNLAYER_OPTIONS,
} from '@/lib/config';

type DevicePreview = 'desktop' | 'tablet' | 'mobile';

/**
 * Unlayer Design JSON type
 * Represents the structure of an email design in Unlayer format
 */
export interface UnlayerDesignJson {
  counters: Record<string, number>;
  body: {
    id?: string;
    rows: unknown[];
    headers?: unknown[];
    footers?: unknown[];
    values: Record<string, unknown>;
  };
  schemaVersion?: number;
}

/**
 * Result of exporting HTML from the Unlayer editor
 */
export interface UnlayerExportResult {
  design: UnlayerDesignJson;
  html: string;
}

/**
 * Props for the UnlayerEmailBuilder component
 */
export interface UnlayerEmailBuilderProps {
  /** Campaign ID for image uploads */
  campaignId: string;
  /** Initial design JSON to load */
  initialDesign?: UnlayerDesignJson | null;
  /** Callback when design changes */
  onDesignChange?: (design: UnlayerDesignJson) => void;
  /** Callback when editor is ready */
  onReady?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Minimum height of the editor */
  minHeight?: string;
  /** Custom style for the container */
  style?: React.CSSProperties;
  /** Callback to open template library */
  onOpenTemplateLibrary?: () => void;
  /** Optional Unlayer project ID (enables paid features like white-labeling) */
  projectId?: number;
}


/**
 * Ref interface for the UnlayerEmailBuilder component
 * Exposes methods to interact with the editor programmatically
 */
export interface UnlayerEmailBuilderRef {
  /** Export HTML and design JSON */
  exportHtml: () => Promise<UnlayerExportResult>;
  /** Save design JSON only */
  saveDesign: () => Promise<UnlayerDesignJson>;
  /** Load a design into the editor */
  loadDesign: (design: UnlayerDesignJson) => void;
  /** Get the underlying editor ref */
  getEditorRef: () => EditorRef | null;
  /** Set device preview mode */
  setPreviewDevice: (device: DevicePreview) => void;
}

const MAX_RETRIES = 3;
const DEBOUNCE_DELAY = 500;

/**
 * CSS styles applied to the wrapper div to hide the Unlayer branding bar.
 *
 * The branding bar ("⚡ by Unlayer Editor") is rendered OUTSIDE the editor iframe
 * as a sibling <div> element. Since the iframe is cross-origin (editor.unlayer.com),
 * we cannot inject CSS into it. Instead we hide the branding via CSS selectors
 * on our wrapper and DOM manipulation after mount.
 *
 * White-labeling (official branding removal) requires the Unlayer Launch plan ($250/mo).
 */
const BRANDING_HIDE_STYLES = `
  .unlayer-editor-wrapper a[href*="unlayer.com"],
  .unlayer-editor-wrapper div:has(> a[href*="unlayer.com"]),
  .unlayer-editor-wrapper div:has(> span > a[href*="unlayer.com"]),
  .unlayer-editor-wrapper div:has(> svg + span + a[href*="unlayer"]),
  .unlayer-editor-wrapper [class*="branding"],
  .unlayer-editor-wrapper [class*="powered-by"] {
    display: none !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    position: absolute !important;
    top: -9999px !important;
    left: -9999px !important;
  }
`;

/**
 * UnlayerEmailBuilder Component
 * 
 * A wrapper component for the Unlayer email editor that provides:
 * - ORA brand styling and configuration
 * - Merge tag support for personalization
 * - Image upload integration
 * - Design change event handling
 * - Error handling with retry logic
 * - Branding removal via wrapper CSS + DOM manipulation
 * 
 * Based on the official Unlayer React component:
 * @see https://docs.unlayer.com/builder/react-component
 * @see https://github.com/unlayer/react-email-editor
 */
export const UnlayerEmailBuilder = forwardRef<
  UnlayerEmailBuilderRef,
  UnlayerEmailBuilderProps
>(function UnlayerEmailBuilder(
  {
    campaignId,
    initialDesign,
    onDesignChange,
    onReady,
    onError,
    minHeight = '100%',
    style,
    onOpenTemplateLibrary,
    projectId,
  },
  ref
) {
  const emailEditorRef = useRef<EditorRef | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isReadyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const brandingObserverRef = useRef<MutationObserver | null>(null);

  // Set device preview in Unlayer (uses Unlayer's built-in device switcher)
  const setPreviewDevice = useCallback((device: DevicePreview) => {
    const editor = emailEditorRef.current?.editor;
    if (editor) {
      (editor as unknown as { setDevice: (device: string) => void }).setDevice(device);
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    exportHtml: async (): Promise<UnlayerExportResult> => {
      return new Promise((resolve, reject) => {
        if (!emailEditorRef.current?.editor) {
          reject(new Error('Editor not initialized'));
          return;
        }

        emailEditorRef.current.editor.exportHtml((data) => {
          const { design, html } = data;
          resolve({ design: design as UnlayerDesignJson, html });
        });
      });
    },

    saveDesign: async (): Promise<UnlayerDesignJson> => {
      return new Promise((resolve, reject) => {
        if (!emailEditorRef.current?.editor) {
          reject(new Error('Editor not initialized'));
          return;
        }

        emailEditorRef.current.editor.saveDesign((design: UnlayerDesignJson) => {
          resolve(design);
        });
      });
    },

    loadDesign: (design: UnlayerDesignJson) => {
      if (emailEditorRef.current?.editor) {
        // Cast to any to work around strict type checking - Unlayer accepts our format
        emailEditorRef.current.editor.loadDesign(design as unknown as Parameters<typeof emailEditorRef.current.editor.loadDesign>[0]);
      }
    },

    getEditorRef: () => emailEditorRef.current,

    setPreviewDevice,
  }));

  // Handle image upload
  const handleImageUpload = useCallback(
    async (
      file: File,
      done: (result: { progress?: number; url?: string }) => void
    ) => {
      try {
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          const error = new Error(
            'Invalid file type. Please upload JPEG, PNG, GIF, or WebP images.'
          );
          console.error('[UnlayerEmailBuilder] Image upload error:', error);
          onError?.(error);
          done({ progress: 0 });
          return;
        }

        // Validate file size (10MB max)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
          const error = new Error('File size exceeds 10MB limit.');
          console.error('[UnlayerEmailBuilder] Image upload error:', error);
          onError?.(error);
          done({ progress: 0 });
          return;
        }

        // Show progress
        done({ progress: 10 });

        // Create form data
        const formData = new FormData();
        formData.append('file', file);

        // Upload to API
        const response = await fetch(`/api/campaigns/${campaignId}/assets`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();

        // Return the public URL to Unlayer
        done({ progress: 100, url: result.publicUrl || result.url });
      } catch (error) {
        console.error('[UnlayerEmailBuilder] Image upload error:', error);
        onError?.(error instanceof Error ? error : new Error('Image upload failed'));
        done({ progress: 0 });
      }
    },
    [campaignId, onError]
  );

  // Handle editor ready event
  const handleEditorReady = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    isReadyRef.current = true;

    const editor = emailEditorRef.current?.editor;
    if (!editor) return;

    // Remove "Powered by Unlayer Editor" branding from the DOM.
    // The branding bar is rendered OUTSIDE the iframe as a sibling element.
    // We target it via DOM traversal since CSS :has() may not be supported in all browsers.
    const removeBranding = () => {
      if (!containerRef.current) return;

      // Strategy 1: Find all anchor tags linking to unlayer.com and hide their parent containers
      const links = containerRef.current.querySelectorAll('a[href*="unlayer"]');
      links.forEach((link) => {
        // Walk up to find the branding container (usually 1-2 levels up)
        let target: HTMLElement | null = link.parentElement;
        // Walk up max 3 levels to find the bar container
        for (let i = 0; i < 3 && target && target !== containerRef.current; i++) {
          if (
            target.textContent?.includes('Unlayer') ||
            target.querySelector?.('a[href*="unlayer"]')
          ) {
            target.style.cssText =
              'display:none!important;height:0!important;overflow:hidden!important;' +
              'visibility:hidden!important;position:absolute!important;top:-9999px!important;';
          }
          target = target.parentElement;
        }
      });

      // Strategy 2: Target sibling elements after iframes (branding bar pattern)
      const iframes = containerRef.current.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        let sibling = iframe.nextElementSibling;
        while (sibling) {
          const el = sibling as HTMLElement;
          if (
            el.querySelector?.('a[href*="unlayer"]') ||
            el.textContent?.toLowerCase().includes('unlayer')
          ) {
            el.style.cssText =
              'display:none!important;height:0!important;overflow:hidden!important;' +
              'visibility:hidden!important;position:absolute!important;top:-9999px!important;';
          }
          sibling = sibling.nextElementSibling;
        }
      });
    };

    // Run at multiple intervals since branding may render asynchronously
    removeBranding();
    const timers = [100, 300, 600, 1000, 2000, 4000].map((ms) =>
      setTimeout(removeBranding, ms)
    );

    // Watch for branding being injected dynamically via MutationObserver
    if (containerRef.current) {
      // Disconnect any previous observer
      brandingObserverRef.current?.disconnect();

      const observer = new MutationObserver(() => removeBranding());
      observer.observe(containerRef.current, { childList: true, subtree: true });
      brandingObserverRef.current = observer;

      // Disconnect after 15s to avoid perf overhead
      setTimeout(() => {
        observer.disconnect();
        brandingObserverRef.current = null;
      }, 15000);
    }

    // Register image upload callback
    editor.registerCallback('image', async (file: File, done: (result: { progress?: number; url?: string }) => void) => {
      await handleImageUpload(file, done);
    });

    // Load initial design if provided
    if (initialDesign) {
      // Cast to any to work around strict type checking - Unlayer accepts our format
      editor.loadDesign(initialDesign as unknown as Parameters<typeof editor.loadDesign>[0]);
    }

    // Register design:updated event listener
    if (onDesignChange) {
      editor.addEventListener(
        'design:updated',
        () => {
          // Debounce the callback to avoid excessive calls
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          debounceTimerRef.current = setTimeout(() => {
            if (emailEditorRef.current?.editor) {
              emailEditorRef.current.editor.saveDesign((design: UnlayerDesignJson) => {
                onDesignChange(design);
              });
            }
          }, DEBOUNCE_DELAY);
        }
      );
    }

    onReady?.();
  }, [initialDesign, onDesignChange, onReady, handleImageUpload]);

  // Handle retry
  const handleRetry = useCallback(() => {
    if (retryCount < MAX_RETRIES) {
      setRetryCount((prev) => prev + 1);
      setHasError(false);
      setIsLoading(true);
      setErrorMessage('');
    }
  }, [retryCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      brandingObserverRef.current?.disconnect();
    };
  }, []);

  // Error fallback UI
  if (hasError) {
    const canRetry = retryCount < MAX_RETRIES;

    return (
      <div
        className="flex flex-col items-center justify-center gap-4 p-8 bg-ora-cream rounded-lg border border-ora-sand"
        style={{ minHeight, ...style }}
      >
        <AlertCircle className="h-12 w-12 text-red-500 stroke-1" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-ora-charcoal mb-2">
            Failed to Load Email Editor
          </h3>
          <p className="text-sm text-ora-graphite mb-4">
            {errorMessage || 'An unexpected error occurred while loading the editor.'}
          </p>
          {canRetry ? (
            <Button onClick={handleRetry} variant="outline">
              <RefreshCw className="h-4 w-4 stroke-1" />
              Retry ({MAX_RETRIES - retryCount} attempts remaining)
            </Button>
          ) : (
            <p className="text-sm text-ora-stone">
              Please refresh the page to try again.
            </p>
          )}
        </div>
      </div>
    );
  }


  // Editor options with merge tags, per the official Unlayer React component API.
  // All config goes inside `options` prop (appearance, features, fonts, etc.)
  // @see https://docs.unlayer.com/builder/react-component
  const editorOptions: EmailEditorProps['options'] = {
    ...ORA_UNLAYER_OPTIONS,
    mergeTags: ORA_MERGE_TAGS,
    ...(projectId ? { projectId } : {}),
  };

  return (
    <div
      ref={containerRef}
      className={`unlayer-editor-wrapper relative flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}
      style={isFullscreen ? undefined : { minHeight, height: '100%', ...style }}
    >
      {/* Inject wrapper CSS to hide Unlayer branding bar (rendered outside iframe) */}
      <style dangerouslySetInnerHTML={{ __html: BRANDING_HIDE_STYLES }} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-ora-cream border-b border-ora-sand">
        <div className="flex items-center gap-2">
          {onOpenTemplateLibrary && (
            <button
              onClick={onOpenTemplateLibrary}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ora-charcoal bg-white border border-ora-sand rounded-lg hover:bg-ora-sand/50 transition-colors"
              title="Choose a template"
            >
              <LayoutTemplate className="h-4 w-4 stroke-1" />
              Templates
            </button>
          )}
        </div>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg text-ora-graphite hover:bg-ora-sand transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4 stroke-1" />
          ) : (
            <Maximize2 className="h-4 w-4 stroke-1" />
          )}
        </button>
      </div>

      {/* Editor — Unlayer recommends at least 1024px wide and 700px high */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-ora-cream/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-ora-gold border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-ora-graphite">Loading email editor...</p>
            </div>
          </div>
        )}

        <EmailEditor
          ref={emailEditorRef}
          onReady={handleEditorReady}
          onLoad={handleEditorReady}
          options={editorOptions}
          minHeight={isFullscreen ? 'calc(100vh - 44px)' : '700px'}
          style={{
            height: isFullscreen ? 'calc(100vh - 44px)' : 'calc(100vh - 140px)',
            minHeight: '700px',
          }}
        />
      </div>
    </div>
  );
});

export default UnlayerEmailBuilder;
