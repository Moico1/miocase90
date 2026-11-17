import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase';

const pendingRowSchema = z.object({
  user_id: z.string().uuid(),
  created_at: z.string(),
});

const profileRowSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
});

const reportRowSchema = z.object({
  id: z.string().uuid(),
  listing_id: z.string().uuid(),
  reporter_id: z.string().uuid(),
  reason: z.string(),
  created_at: z.string(),
});

const listingRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(['active', 'sold', 'removed', 'draft']),
});

const socialReportRowSchema = z.object({
  id: z.string().uuid(),
  target_type: z.enum(['store', 'review', 'comment']),
  target_id: z.string().uuid(),
  reason: z.string(),
  created_at: z.string(),
  target_title: z.string().nullable(),
});

const whatsappVerificationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string(),
  requested_number: z.string(),
  status: z.enum(['pending', 'code_issued', 'expired']),
  created_at: z.string(),
  expires_at: z.string(),
});

export type PendingMember = {
  userId: string;
  displayName: string;
  createdAt: string;
};

export type OpenReport = {
  id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
  listingTitle: string;
  listingStatus: 'active' | 'sold' | 'removed' | 'draft';
};

export type OpenSocialReport = {
  id: string;
  targetType: 'store' | 'review' | 'comment';
  targetId: string;
  reason: string;
  createdAt: string;
  targetTitle: string | null;
};

export type WhatsAppVerificationRequest = {
  id: string;
  userId: string;
  displayName: string;
  requestedNumber: string;
  status: 'pending' | 'code_issued' | 'expired';
  createdAt: string;
  expiresAt: string;
};

function parseResponse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`La respuesta de ${label} no tiene el formato esperado.`);
  }
  return parsed.data;
}

export async function fetchPendingMembers(): Promise<PendingMember[]> {
  const client = getSupabaseClient();
  const { data: membershipData, error: membershipError } = await client
    .from('community_memberships')
    .select('user_id, created_at')
    .eq('status', 'pending')
    .order('created_at');

  if (membershipError) throw membershipError;
  const memberships = parseResponse(
    z.array(pendingRowSchema),
    membershipData,
    'las membresías pendientes'
  );
  if (memberships.length === 0) return [];

  const { data: profileData, error: profileError } = await client
    .from('profiles')
    .select('id, display_name')
    .in('id', memberships.map((membership) => membership.user_id));

  if (profileError) throw profileError;
  const profiles = parseResponse(z.array(profileRowSchema), profileData, 'los perfiles');
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.display_name]));

  return memberships.map((membership) => {
    const displayName = profileById.get(membership.user_id);
    if (!displayName) {
      throw new Error('No se encontró el perfil de una cuenta pendiente.');
    }
    return {
      userId: membership.user_id,
      displayName,
      createdAt: membership.created_at,
    };
  });
}

export async function fetchOpenReports(): Promise<OpenReport[]> {
  const client = getSupabaseClient();
  const { data: reportData, error: reportError } = await client
    .from('reports')
    .select('id, listing_id, reporter_id, reason, created_at')
    .eq('status', 'open')
    .order('created_at');

  if (reportError) throw reportError;
  const reports = parseResponse(z.array(reportRowSchema), reportData, 'los reportes abiertos');
  if (reports.length === 0) return [];

  const { data: listingData, error: listingError } = await client
    .from('listings')
    .select('id, title, status')
    .in('id', reports.map((report) => report.listing_id));

  if (listingError) throw listingError;
  const listings = parseResponse(z.array(listingRowSchema), listingData, 'las publicaciones');
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));

  return reports.map((report) => {
    const listing = listingById.get(report.listing_id);
    if (!listing) {
      throw new Error('No se encontró una publicación asociada a un reporte abierto.');
    }
    return {
      id: report.id,
      listingId: report.listing_id,
      reporterId: report.reporter_id,
      reason: report.reason,
      createdAt: report.created_at,
      listingTitle: listing.title,
      listingStatus: listing.status,
    };
  });
}

export async function fetchOpenSocialReports(): Promise<OpenSocialReport[]> {
  const { data, error } = await getSupabaseClient().rpc('get_admin_content_reports');
  if (error) throw error;
  return parseResponse(
    z.array(socialReportRowSchema),
    data,
    'los reportes de tiendas y comentarios'
  ).map((report) => ({
    id: report.id,
    targetType: report.target_type,
    targetId: report.target_id,
    reason: report.reason,
    createdAt: report.created_at,
    targetTitle: report.target_title,
  }));
}

export async function fetchWhatsAppVerificationRequests(): Promise<WhatsAppVerificationRequest[]> {
  const { data, error } = await getSupabaseClient().rpc('get_admin_whatsapp_verifications');
  if (error) throw error;
  return parseResponse(
    z.array(whatsappVerificationRowSchema),
    data,
    'las verificaciones de WhatsApp'
  ).map((request) => ({
    id: request.id,
    userId: request.user_id,
    displayName: request.display_name,
    requestedNumber: request.requested_number,
    status: request.status,
    createdAt: request.created_at,
    expiresAt: request.expires_at,
  }));
}
