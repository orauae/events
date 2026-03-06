"use client";

import { useState, useMemo } from 'react';
import { X, Zap, GitBranch, Play, ArrowRight, Loader2, Sparkles, Users, Clock, Star, MessageSquare, Eye, ChevronRight } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useAutomationTemplates, useImportTemplate } from '@/hooks/use-automation-templates';
import type { AutomationTemplate, TemplateCategory } from '@/lib/automation-templates';

interface TemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  onImportSuccess?: (automationId: string) => void;
}

// Category display configuration
const CATEGORY_CONFIG: Record<TemplateCategory, { label: string; icon: React.ElementType; color: string }> = {
  engagement: { label: 'Engagement', icon: Sparkles, color: 'bg-purple-100 text-purple-800' },
  reminder: { label: 'Reminder', icon: Clock, color: 'bg-blue-100 text-blue-800' },
  'follow-up': { label: 'Follow-up', icon: MessageSquare, color: 'bg-green-100 text-green-800' },
  vip: { label: 'VIP', icon: Star, color: 'bg-amber-100 text-amber-800' },
};

// Get node icon based on type
function getNodeIcon(type: string) {
  switch (type) {
    case 'trigger':
      return Zap;
    case 'condition':
      return GitBranch;
    case 'action':
      return Play;
    default:
      return Play;
  }
}

// Get node color based on type
function getNodeColor(type: string) {
  switch (type) {
    case 'trigger':
      return 'bg-ora-gold/20 text-ora-gold border-ora-gold/30';
    case 'condition':
      return 'bg-ora-sand text-ora-graphite border-ora-stone/30';
    case 'action':
      return 'bg-ora-cream text-ora-graphite border-ora-stone/30';
    default:
      return 'bg-ora-cream text-ora-graphite border-ora-stone/30';
  }
}

interface WorkflowPreviewProps {
  template: AutomationTemplate;
  compact?: boolean;
}

function WorkflowPreview({ template, compact = false }: WorkflowPreviewProps) {
  const sortedNodes = useMemo(() => {
    return [...template.nodes].sort((a, b) => a.position.y - b.position.y);
  }, [template.nodes]);

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {sortedNodes.slice(0, 3).map((node, index) => {
          const Icon = getNodeIcon(node.type);
          return (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && <ArrowRight className="w-3 h-3 text-ora-stone" />}
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-ora-cream text-xs">
                <Icon className="w-3 h-3" />
                <span className="truncate max-w-[80px]">{node.label}</span>
              </div>
            </div>
          );
        })}
        {sortedNodes.length > 3 && (
          <span className="text-xs text-ora-graphite">+{sortedNodes.length - 3} more</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedNodes.map((node, index) => {
        const Icon = getNodeIcon(node.type);
        const colorClass = getNodeColor(node.type);
        
        return (
          <div key={index} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              {index < sortedNodes.length - 1 && (
                <div className="w-0.5 h-6 bg-ora-sand mt-1" />
              )}
            </div>
            <div className="flex-1 pt-1">
              <p className="font-medium text-ora-charcoal text-sm">{node.label}</p>
              <p className="text-xs text-ora-graphite capitalize">{node.type}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TemplateDetailProps {
  template: AutomationTemplate;
  onImport: () => void;
  isImporting: boolean;
  onBack: () => void;
}

function TemplateDetail({ template, onImport, isImporting, onBack }: TemplateDetailProps) {
  const categoryConfig = CATEGORY_CONFIG[template.category];
  const CategoryIcon = categoryConfig.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-ora-graphite hover:text-ora-charcoal mb-4"
      >
        <ArrowRight className="w-4 h-4 rotate-180" />
        Back to templates
      </button>

      {/* Template header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-semibold text-ora-charcoal">{template.name}</h2>
          <Badge className={categoryConfig.color}>
            <CategoryIcon className="w-3 h-3 mr-1" />
            {categoryConfig.label}
          </Badge>
        </div>
        <p className="text-ora-graphite">{template.description}</p>
      </div>

      {/* Workflow steps */}
      <div className="flex-1 overflow-auto">
        <h3 className="text-sm font-medium text-ora-charcoal mb-4">Workflow Steps</h3>
        <div className="bg-ora-cream/50 rounded-lg p-4">
          <WorkflowPreview template={template} />
        </div>

        {/* Node count summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-ora-gold/10 rounded-lg">
            <Zap className="w-5 h-5 text-ora-gold mx-auto mb-1" />
            <p className="text-lg font-semibold text-ora-charcoal">
              {template.nodes.filter(n => n.type === 'trigger').length}
            </p>
            <p className="text-xs text-ora-graphite">Triggers</p>
          </div>
          <div className="text-center p-3 bg-ora-sand/50 rounded-lg">
            <GitBranch className="w-5 h-5 text-ora-graphite mx-auto mb-1" />
            <p className="text-lg font-semibold text-ora-charcoal">
              {template.nodes.filter(n => n.type === 'condition').length}
            </p>
            <p className="text-xs text-ora-graphite">Conditions</p>
          </div>
          <div className="text-center p-3 bg-ora-cream rounded-lg">
            <Play className="w-5 h-5 text-ora-graphite mx-auto mb-1" />
            <p className="text-lg font-semibold text-ora-charcoal">
              {template.nodes.filter(n => n.type === 'action').length}
            </p>
            <p className="text-xs text-ora-graphite">Actions</p>
          </div>
        </div>
      </div>

      {/* Import button */}
      <div className="pt-4 border-t border-ora-sand mt-4">
        <Button onClick={onImport} disabled={isImporting} className="w-full">
          {isImporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Use This Template
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface TemplateListItemProps {
  template: AutomationTemplate;
  onClick: () => void;
}

function TemplateListItem({ template, onClick }: TemplateListItemProps) {
  const categoryConfig = CATEGORY_CONFIG[template.category];
  const CategoryIcon = categoryConfig.icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-lg border border-ora-sand bg-white hover:border-ora-gold/50 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-ora-charcoal">{template.name}</h4>
        <Badge className={`${categoryConfig.color} text-xs`}>
          <CategoryIcon className="w-3 h-3 mr-1" />
          {categoryConfig.label}
        </Badge>
      </div>
      <p className="text-sm text-ora-graphite mb-3 line-clamp-2">{template.description}</p>
      <div className="flex items-center justify-between">
        <WorkflowPreview template={template} compact />
        <ChevronRight className="w-4 h-4 text-ora-stone flex-shrink-0" />
      </div>
    </button>
  );
}

interface CategoryFilterProps {
  selectedCategory: TemplateCategory | 'all';
  onCategoryChange: (category: TemplateCategory | 'all') => void;
}

function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  const categories: (TemplateCategory | 'all')[] = ['all', 'engagement', 'reminder', 'follow-up', 'vip'];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {categories.map((category) => {
        const isAll = category === 'all';
        const config = isAll ? null : CATEGORY_CONFIG[category];
        const Icon = isAll ? Users : config!.icon;
        const isSelected = selectedCategory === category;

        return (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
              transition-colors duration-150
              ${isSelected
                ? 'bg-ora-gold text-white'
                : 'bg-ora-cream text-ora-graphite hover:bg-ora-sand'
              }
            `}
          >
            <Icon className="w-3.5 h-3.5" />
            {isAll ? 'All' : config!.label}
          </button>
        );
      })}
    </div>
  );
}

export function TemplateLibrary({
  isOpen,
  onClose,
  eventId,
  onImportSuccess,
}: TemplateLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);

  const { data: templates, isLoading, error } = useAutomationTemplates();
  const importTemplate = useImportTemplate();

  // Filter templates by category
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (selectedCategory === 'all') return templates;
    return templates.filter((t) => t.category === selectedCategory);
  }, [templates, selectedCategory]);

  const handleImport = async () => {
    if (!selectedTemplate) return;

    try {
      const result = await importTemplate.mutateAsync({
        templateId: selectedTemplate.id,
        eventId,
      });
      onImportSuccess?.(result.id);
      onClose();
      setSelectedTemplate(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedTemplate(null);
    setSelectedCategory('all');
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:w-[60vw] sm:max-w-[800px] p-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-ora-sand">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-ora-gold" />
              Automation Templates
            </SheetTitle>
            <SheetDescription>
              Choose a pre-built template to get started quickly
            </SheetDescription>
          </SheetHeader>
          
          {!selectedTemplate && (
            <div className="mt-4">
              <CategoryFilter
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {selectedTemplate ? (
            <TemplateDetail
              template={selectedTemplate}
              onImport={handleImport}
              isImporting={importTemplate.isPending}
              onBack={() => setSelectedTemplate(null)}
            />
          ) : (
            <>
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-ora-gold mb-4" />
                  <p className="text-ora-graphite">Loading templates...</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-red-600">Failed to load templates</p>
                </div>
              )}

              {!isLoading && !error && filteredTemplates.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-ora-graphite">No templates found in this category</p>
                </div>
              )}

              {!isLoading && !error && filteredTemplates.length > 0 && (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <TemplateListItem
                      key={template.id}
                      template={template}
                      onClick={() => setSelectedTemplate(template)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
