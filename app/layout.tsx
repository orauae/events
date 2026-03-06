/**
 * @fileoverview Root Layout - Application Shell
 * 
 * This is the root layout component for the ORA Events application.
 * It provides the base HTML structure, global styles, fonts, and
 * context providers that wrap all pages.
 * 
 * ## Providers
 * - QueryProvider: TanStack Query for data fetching
 * - Toaster: Sonner toast notifications
 * 
 * ## Fonts
 * - Poppins: Primary font family (300, 400, 500, 600 weights)
 * 
 * ## Global Styles
 * - Tailwind CSS with ORA design system colors
 * - CSS custom properties for theming
 * 
 * @module app/layout
 * @requires next/font/google - Google Fonts optimization
 * @requires @/components/ui/sonner - Toast notifications
 * @requires @/lib/query-client - TanStack Query provider
 */

import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query-client";
import "./globals.css";

/**
 * Poppins font configuration.
 * Loaded from Google Fonts with optimized subsets and weights.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

/**
 * Application metadata for SEO and browser display.
 */
export const metadata: Metadata = {
  title: "EventOS - Event Management Platform",
  description: "Intelligent event engagement and automation platform",
};

/**
 * Root layout component.
 * 
 * Wraps all pages with necessary providers and global elements:
 * - HTML structure with language attribute
 * - Font classes applied to body
 * - QueryProvider for data fetching
 * - Toaster for notifications
 * 
 * @param props - Layout props
 * @param props.children - Page content to render
 * @returns The root layout with providers
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans antialiased`}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
