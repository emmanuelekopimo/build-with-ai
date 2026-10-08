import * as Dialog from '@radix-ui/react-dialog';
import * as RTooltip from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Modal in the design's pattern: title + subtitle + close, body, divider, right-aligned footer. */
export function Modal({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-gray-900/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col rounded-[20px] bg-white shadow-modal focus:outline-none',
            width === 'sm' && 'max-w-[480px]',
            width === 'md' && 'max-w-[556px]',
            width === 'lg' && 'max-w-[760px]',
            className,
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-bold text-gray-900">{title}</Dialog.Title>
              {subtitle ? <p className="mt-1 text-md text-gray-500">{subtitle}</p> : null}
            </div>
            <Dialog.Close
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-5">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Right-hand full-height drawer (sign-off detail). */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-gray-900/30" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[556px] animate-slide-in flex-col border-l border-gray-200 bg-white shadow-modal focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 pb-5 pt-6">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-bold text-gray-900">{title}</Dialog.Title>
              {subtitle ? <p className="mt-1 truncate text-md text-gray-500">{subtitle}</p> : null}
            </div>
            <Dialog.Close
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gray-200 text-gray-500 hover:bg-gray-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-5">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={200}>{children}</RTooltip.Provider>;
}

/** Explains disabled actions (D/UX 5). Wraps children in a focusable span so disabled buttons still show it. */
export function Tooltip({ content, children }: { content?: ReactNode; children: ReactNode }) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>
        <span tabIndex={0} className="inline-flex rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {children}
        </span>
      </RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={6}
          className="z-[60] max-w-[280px] rounded-sm bg-gray-800 px-3 py-2 text-sm text-white shadow-3"
        >
          {content}
          <RTooltip.Arrow className="fill-gray-800" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
