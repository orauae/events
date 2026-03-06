"use client"

import { use, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Loader2, Save, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useCampaign, useEvent, useSaveCampaignDesign, useSaveCampaignContent, useWhatsAppChannel } from '@/hooks';
import { 
  UnlayerEmailBuilder, 
  type UnlayerEmailBuilderRef,
  type UnlayerDesignJson,
  TemplateLibrarySheet,
} from '@/components/unlayer-email-builder';
import { WhatsAppComposer } from '@/components/whatsapp-composer';
import { SmsComposer } from '@/components/sms-composer';
import { Button } from '@/components/ui';
import type { EmailBuilderState } from '@/lib/types/email-builder';
import { isUnlayerFormat, ensureUnlayerFormat } from '@/lib/utils/design-format-converter';

interface PageProps {
  params: Promise<{
    id: string;
    campaignId: string;
  }>;
}

export default function AdminCampaignBuilderPage({ params }: PageProps) {
  const { id: eventId, campaignId } = use(params);
  const router = useRouter();
  const editorRef = useRef<UnlayerEmailBuilderRef>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  
  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId);
  const { data: whatsAppChannel } = useWhatsAppChannel(eventId);
  const saveCampaignDesign = useSaveCampaignDesign();
  const saveCampaignContent = useSaveCampaignContent();

  const isLoading = eventLoading || campaignLoading;

  const channel = campaign?.channel || 'email';
  const isWhatsApp = channel === 'whatsapp';
  const isSms = channel === 'sms';
  const isEmail = channel === 'email';

  // WhatsApp state
  const campaignAny = campaign as Record<string, unknown> | undefined;
  const [waData, setWaData] = useState<{
    subject: string;
    whatsappTemplateId: string;
    whatsappMessageBody: string;
    whatsappMediaUrl: string;
    whatsappMediaType: "" | "image" | "document" | "video";
  }>({
    subject: '',
    whatsappTemplateId: '',
    whatsappMessageBody: '',
    whatsappMediaUrl: '',
    whatsappMediaType: '',
  });

  // SMS state
  const [smsData, setSmsData] = useState<{
    subject: string;
    smsBody: string;
    smsSenderId: string;
    smsOptOutFooter: boolean;
  }>({
    subject: '',
    smsBody: '',
    smsSenderId: '',
    smsOptOutFooter: true,
  });

  // Initialize WhatsApp/SMS state from campaign data once loaded
  const [initialized, setInitialized] = useState(false);
  if (campaign && !initialized) {
    if (isWhatsApp) {
      const waContent = campaignAny?.whatsappContent as Record<string, unknown> | null;
      setWaData({
        subject: campaign.subject || '',
        whatsappTemplateId: (campaignAny?.whatsappTemplateId as string) || '',
        whatsappMessageBody: waContent?.text
          ? ((waContent.text as Record<string, unknown>)?.body as string) || ''
          : '',
        whatsappMediaUrl: (campaignAny?.whatsappMediaUrl as string) || '',
        whatsappMediaType: ((campaignAny?.whatsappMediaType as string) || '') as "" | "image" | "document" | "video",
      });
    }
    if (isSms) {
      setSmsData({
        subject: campaign.subject || '',
        smsBody: (campaignAny?.smsBody as string) || (campaign.content as string) || '',
        smsSenderId: (campaignAny?.smsSenderId as string) || '',
        smsOptOutFooter: campaignAny?.smsOptOutFooter !== false,
      });
    }
    setInitialized(true);
  }

  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true);
  }, []);

  const handleEditorError = useCallback((error: Error) => {
    console.error('[AdminCampaignBuilderPage] Editor error:', error);
    toast.error(`Email editor error: ${error.message}`);
  }, []);

  const handleTemplateSelect = useCallback((design: UnlayerDesignJson) => {
    if (editorRef.current) {
      editorRef.current.loadDesign(design);
    }
    setIsTemplateLibraryOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isEmail) {
      if (!editorRef.current || !isEditorReady) {
        toast.error('Editor not ready');
        return;
      }
      setIsSaving(true);
      try {
        const result = await editorRef.current.exportHtml();
        await saveCampaignDesign.mutateAsync({
          campaignId,
          designJson: result.design,
          htmlContent: result.html,
        });
      } catch (error) {
        console.error('[AdminCampaignBuilderPage] Save error:', error);
        toast.error('Failed to save design');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setIsSaving(true);
    try {
      if (isWhatsApp) {
        await saveCampaignContent.mutateAsync({
          campaignId,
          subject: waData.subject,
          whatsappTemplateId: waData.whatsappTemplateId || null,
          whatsappMessageBody: waData.whatsappMessageBody || null,
          whatsappMediaUrl: waData.whatsappMediaUrl || null,
          whatsappMediaType: waData.whatsappMediaType || null,
          whatsappContent: waData.whatsappMessageBody
            ? { type: 'text', text: { body: waData.whatsappMessageBody } }
            : waData.whatsappTemplateId
              ? { type: 'template', template: { name: waData.whatsappTemplateId, language: { code: 'en' } } }
              : null,
          content: waData.whatsappMessageBody || `Template: ${waData.whatsappTemplateId}`,
        });
      } else if (isSms) {
        await saveCampaignContent.mutateAsync({
          campaignId,
          subject: smsData.subject,
          content: smsData.smsBody,
          smsBody: smsData.smsBody,
          smsSenderId: smsData.smsSenderId || null,
          smsOptOutFooter: smsData.smsOptOutFooter,
        });
      }
    } catch (error) {
      console.error('[AdminCampaignBuilderPage] Save error:', error);
      toast.error('Failed to save content');
    } finally {
      setIsSaving(false);
    }
  }, [campaignId, isEmail, isWhatsApp, isSms, isEditorReady, saveCampaignDesign, saveCampaignContent, waData, smsData]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ora-gold" />
      </div>
    );
  }

  if (!event || !campaign) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-ora-graphite">Campaign not found</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 stroke-1" />
          Go Back
        </Button>
      </div>
    );
  }

  const campaignWithDesign = campaign as typeof campaign & { 
    designJson?: EmailBuilderState | UnlayerDesignJson | null;
    unlayerDesignJson?: UnlayerDesignJson | null;
  };
  
  let initialDesign: UnlayerDesignJson | null = null;
  
  if (isEmail) {
    if (campaignWithDesign.unlayerDesignJson) {
      initialDesign = campaignWithDesign.unlayerDesignJson;
    } else if (campaignWithDesign.designJson) {
      if (isUnlayerFormat(campaignWithDesign.designJson)) {
        initialDesign = campaignWithDesign.designJson as UnlayerDesignJson;
      } else {
        const conversionResult = ensureUnlayerFormat(campaignWithDesign.designJson as EmailBuilderState);
        if (conversionResult.success && conversionResult.design) {
          initialDesign = conversionResult.design;
        }
      }
    }
  }

  const channelLabel = isWhatsApp ? 'WhatsApp' : isSms ? 'SMS' : 'Email';
  const saveDisabled = isEmail ? (!isEditorReady || isSaving) : isSaving;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-ora-sand bg-ora-white">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/admin/events/${eventId}`)}
        >
          <ArrowLeft className="h-4 w-4 stroke-1" />
          Back to Event
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <div>
            <h1 className="text-lg font-semibold text-ora-charcoal">
              {campaign.name}
            </h1>
            <p className="text-sm text-ora-graphite">
              {event.name} · {channelLabel}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4 stroke-1" />
          )}
          Save {isEmail ? 'Design' : 'Content'}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {isEmail && (
          <>
            <UnlayerEmailBuilder
              ref={editorRef}
              campaignId={campaignId}
              initialDesign={initialDesign}
              onReady={handleEditorReady}
              onError={handleEditorError}
              onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
              style={{ height: '100%' }}
            />
            <TemplateLibrarySheet
              isOpen={isTemplateLibraryOpen}
              onClose={() => setIsTemplateLibraryOpen(false)}
              onSelectTemplate={handleTemplateSelect}
            />
          </>
        )}

        {isWhatsApp && (
          <div className="h-full overflow-auto p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#25D366]/10">
                <Image src="/icons/whatsapp-color.svg" alt="WhatsApp" width={24} height={24} />
              </div>
              <div>
                <h2 className="text-lg font-medium text-ora-charcoal">Edit WhatsApp Message</h2>
                <p className="text-sm text-ora-graphite">Update your message, template, or header image</p>
              </div>
            </div>
            <WhatsAppComposer
              data={waData}
              onChange={(updates) => setWaData((prev) => ({ ...prev, ...updates }))}
              channelId={whatsAppChannel?.id}
            />
          </div>
        )}

        {isSms && (
          <div className="h-full overflow-auto p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50">
                <Smartphone className="h-6 w-6 stroke-1 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-ora-charcoal">Edit SMS Message</h2>
                <p className="text-sm text-ora-graphite">Update your text message content</p>
              </div>
            </div>
            <SmsComposer
              data={smsData}
              onChange={(updates) => setSmsData((prev) => ({ ...prev, ...updates }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
