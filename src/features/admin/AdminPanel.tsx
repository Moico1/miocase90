import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ExpoLinking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Button, Card, Divider, Text, useTheme } from 'react-native-paper';

import {
  fetchOpenReports,
  fetchOpenSocialReports,
  fetchPendingMembers,
  fetchWhatsAppVerificationRequests,
  type OpenSocialReport,
  type OpenReport,
  type PendingMember,
  type WhatsAppVerificationRequest,
} from './adminQueries';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';

type MembershipDecision = 'verified' | 'rejected';
type ReportDecision = 'reviewed' | 'dismissed';

const listingStatusLabels: Record<OpenReport['listingStatus'], string> = {
  active: 'Activa',
  sold: 'Vendida',
  removed: 'Oculta',
  draft: 'Borrador',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-BO');
}

export function AdminPanel() {
  const theme = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isCopyingInvite, setIsCopyingInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busyWhatsappRequestId, setBusyWhatsappRequestId] = useState<string | null>(null);
  const [issuedWhatsappCode, setIssuedWhatsappCode] = useState<{ requestId: string; code: string } | null>(null);
  const [isCopyingWhatsappCode, setIsCopyingWhatsappCode] = useState(false);

  const pendingQuery = useQuery({
    queryKey: ['admin-pending-members'],
    enabled: Boolean(session?.user.id),
    queryFn: fetchPendingMembers,
  });
  const reportsQuery = useQuery({
    queryKey: ['admin-open-reports'],
    enabled: Boolean(session?.user.id),
    queryFn: fetchOpenReports,
  });
  const socialReportsQuery = useQuery({
    queryKey: ['admin-open-social-reports'],
    enabled: Boolean(session?.user.id),
    queryFn: fetchOpenSocialReports,
  });
  const whatsappVerificationsQuery = useQuery({
    queryKey: ['admin-whatsapp-verifications'],
    enabled: Boolean(session?.user.id),
    queryFn: fetchWhatsAppVerificationRequests,
  });

  async function decideMembership(userId: string, decision: MembershipDecision) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyMembershipId(userId);

    try {
      const { error } = await getSupabaseClient().rpc('moderate_membership', {
        target_user_id: userId,
        target_status: decision,
        moderator_note: null,
      });
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-pending-members'] }),
        queryClient.invalidateQueries({ queryKey: ['community-membership', userId] }),
      ]);
      setSuccessMessage(
        decision === 'verified'
          ? 'El vendedor fue aprobado.'
          : 'La solicitud de vendedor fue rechazada.'
      );
    } catch {
      setErrorMessage('No se pudo actualizar la membresía. Comprueba tu conexión e inténtalo otra vez.');
    } finally {
      setBusyMembershipId(null);
    }
  }

  async function generateInvite() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsGeneratingInvite(true);

    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await getSupabaseClient().rpc('create_membership_invite', {
        invite_expires_at: expiresAt,
      });
      if (error) throw error;
      if (typeof data !== 'string' || data.length === 0) {
        throw new Error('Supabase no devolvió un código de invitación.');
      }
      setInviteCode(data);
      setSuccessMessage('Código generado. Cópialo ahora; no se volverá a mostrar.');
    } catch {
      setErrorMessage('No se pudo generar el código de invitación. Inténtalo otra vez.');
    } finally {
      setIsGeneratingInvite(false);
    }
  }

  async function copyInvite() {
    if (!inviteCode) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsCopyingInvite(true);

    try {
      await Clipboard.setStringAsync(inviteCode);
      setInviteCode(null);
      setSuccessMessage('Código copiado. Guárdalo y compártelo con una sola persona.');
    } catch {
      setErrorMessage('No se pudo copiar el código. Comprueba los permisos del portapapeles.');
    } finally {
      setIsCopyingInvite(false);
    }
  }

  async function decideReport(
    report: OpenReport,
    decision: ReportDecision,
    hideListing: boolean
  ) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyReportId(report.id);

    try {
      const { error } = await getSupabaseClient().rpc('moderate_report', {
        target_report_id: report.id,
        target_report_status: decision,
        hide_listing: hideListing,
        moderator_note: null,
      });
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-open-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['active-listings'] }),
        queryClient.invalidateQueries({ queryKey: ['listing-detail', report.listingId] }),
      ]);
      setSuccessMessage(
        hideListing
          ? 'La publicación fue ocultada y el reporte quedó revisado.'
          : decision === 'reviewed'
            ? 'El reporte quedó revisado.'
            : 'El reporte fue descartado.'
      );
    } catch {
      setErrorMessage('No se pudo resolver el reporte. Actualiza la lista e inténtalo otra vez.');
    } finally {
      setBusyReportId(null);
    }
  }

  async function decideSocialReport(
    report: OpenSocialReport,
    decision: ReportDecision,
    hideTarget: boolean
  ) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyReportId(report.id);
    try {
      const { error } = await getSupabaseClient().rpc('moderate_content_report', {
        target_report_id: report.id,
        report_decision: decision,
        hide_target: hideTarget,
        moderator_note: null,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-open-social-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['public-store'] }),
        queryClient.invalidateQueries({ queryKey: ['public-store-reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['listing-comments'] }),
        queryClient.invalidateQueries({ queryKey: ['featured-stores'] }),
      ]);
      setSuccessMessage(
        hideTarget
          ? 'El contenido fue ocultado y el reporte quedó revisado.'
          : decision === 'reviewed'
            ? 'El reporte quedó revisado.'
            : 'El reporte fue descartado.'
      );
    } catch {
      setErrorMessage('No se pudo resolver el reporte social. Actualiza la lista e inténtalo otra vez.');
    } finally {
      setBusyReportId(null);
    }
  }

  async function openWhatsapp(request: WhatsAppVerificationRequest) {
    try {
      const digits = request.requestedNumber.replace(/\D/g, '');
      await ExpoLinking.openURL(`https://wa.me/${digits}`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo abrir WhatsApp para este número.'
      );
    }
  }

  async function issueWhatsappCode(requestId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyWhatsappRequestId(requestId);
    setIssuedWhatsappCode(null);
    try {
      const { data, error } = await getSupabaseClient().rpc('admin_issue_whatsapp_code', {
        target_verification_id: requestId,
      });
      if (error) throw error;
      if (typeof data !== 'string' || !/^[0-9]{4}$/.test(data)) {
        throw new Error('Supabase no devolvió un código válido de cuatro dígitos.');
      }
      setIssuedWhatsappCode({ requestId, code: data });
      await queryClient.invalidateQueries({ queryKey: ['admin-whatsapp-verifications'] });
      setSuccessMessage('Código generado. Envíalo por WhatsApp y cópialo antes de cerrar esta pantalla.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo generar el código de WhatsApp.'
      );
    } finally {
      setBusyWhatsappRequestId(null);
    }
  }

  async function copyWhatsappCode() {
    if (!issuedWhatsappCode) return;
    setIsCopyingWhatsappCode(true);
    setErrorMessage(null);
    try {
      await Clipboard.setStringAsync(issuedWhatsappCode.code);
      setIssuedWhatsappCode(null);
      setSuccessMessage('Código copiado y ocultado. Envíalo al vendedor por WhatsApp.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo copiar el código al portapapeles.'
      );
    } finally {
      setIsCopyingWhatsappCode(false);
    }
  }

  if (!session?.user.id) return null;

  return (
    <View style={styles.container}>
      <Divider />
      <Text variant="headlineSmall">Administración</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Las decisiones se validan también en Supabase.
      </Text>

      {errorMessage ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {errorMessage}
        </Text>
      ) : null}
      {successMessage ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>
          {successMessage}
        </Text>
      ) : null}

      <Text variant="titleLarge">Solicitudes de vendedores</Text>
      {pendingQuery.isPending ? (
        <ActivityIndicator />
      ) : pendingQuery.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">No se pudieron cargar las cuentas pendientes.</Text>
          <Button onPress={() => void pendingQuery.refetch()}>Reintentar</Button>
        </View>
      ) : pendingQuery.data.length === 0 ? (
        <Text variant="bodyMedium">No hay solicitudes pendientes.</Text>
      ) : (
        pendingQuery.data.map((member: PendingMember) => (
          <Card key={member.userId} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">{member.displayName}</Text>
              <Text variant="bodySmall">Solicitó vender: {formatDate(member.createdAt)}</Text>
              <View style={styles.actionRow}>
                <Button
                  mode="contained"
                  disabled={busyMembershipId !== null}
                  loading={busyMembershipId === member.userId}
                  onPress={() => void decideMembership(member.userId, 'verified')}
                >
                  Aprobar vendedor
                </Button>
                <Button
                  mode="outlined"
                  disabled={busyMembershipId !== null}
                  onPress={() => void decideMembership(member.userId, 'rejected')}
                >
                  Rechazar solicitud
                </Button>
              </View>
            </Card.Content>
          </Card>
        ))
      )}

      <Divider />
      <Text variant="titleLarge">Códigos de invitación</Text>
      <Text variant="bodyMedium">
        Cada código se puede usar una sola vez y vence en siete días.
      </Text>
      {inviteCode ? (
        <Card mode="outlined">
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" selectable>
              {inviteCode}
            </Text>
            <Button
              mode="contained"
              onPress={() => void copyInvite()}
              loading={isCopyingInvite}
              disabled={isCopyingInvite}
            >
              Copiar y ocultar código
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <Button
          mode="outlined"
          onPress={() => void generateInvite()}
          loading={isGeneratingInvite}
          disabled={isGeneratingInvite}
        >
          Generar código
        </Button>
      )}

      <Divider />
      <Text variant="titleLarge">Verificaciones de WhatsApp</Text>
      <Text variant="bodyMedium">
        Abre el chat con el vendedor y envíale el código de cuatro dígitos que generes.
      </Text>
      {issuedWhatsappCode ? (
        <Card mode="outlined">
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" accessibilityLabel="Código de un solo uso" selectable>
              Código: {issuedWhatsappCode.code}
            </Text>
            <Button
              mode="contained"
              onPress={() => void copyWhatsappCode()}
              loading={isCopyingWhatsappCode}
              disabled={isCopyingWhatsappCode}
            >
              Copiar código y ocultar
            </Button>
          </Card.Content>
        </Card>
      ) : null}
      {whatsappVerificationsQuery.isPending ? (
        <ActivityIndicator />
      ) : whatsappVerificationsQuery.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">No se pudieron cargar las solicitudes de WhatsApp.</Text>
          <Button onPress={() => void whatsappVerificationsQuery.refetch()}>Reintentar</Button>
        </View>
      ) : whatsappVerificationsQuery.data.length === 0 ? (
        <Text variant="bodyMedium">No hay verificaciones de WhatsApp pendientes.</Text>
      ) : (
        whatsappVerificationsQuery.data.map((request: WhatsAppVerificationRequest) => (
          <Card key={request.id} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">{request.displayName}</Text>
              <Text variant="bodyMedium">{request.requestedNumber}</Text>
              <Text variant="bodySmall">Solicitado: {formatDate(request.createdAt)}</Text>
              <Text variant="bodySmall">
                Estado: {request.status === 'pending' ? 'Pendiente de código' : 'Código enviado'}
              </Text>
              <View style={styles.actionRow}>
                <Button
                  compact
                  mode="outlined"
                  disabled={busyWhatsappRequestId !== null}
                  onPress={() => void openWhatsapp(request)}
                >
                  Abrir en WhatsApp
                </Button>
                <Button
                  compact
                  mode="contained"
                  disabled={busyWhatsappRequestId !== null}
                  loading={busyWhatsappRequestId === request.id}
                  onPress={() => void issueWhatsappCode(request.id)}
                >
                  Generar código de 4 dígitos
                </Button>
              </View>
            </Card.Content>
          </Card>
        ))
      )}

      <Divider />
      <Text variant="titleLarge">Reportes abiertos</Text>
      {reportsQuery.isPending ? (
        <ActivityIndicator />
      ) : reportsQuery.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">No se pudieron cargar los reportes abiertos.</Text>
          <Button onPress={() => void reportsQuery.refetch()}>Reintentar</Button>
        </View>
      ) : reportsQuery.data.length === 0 ? (
        <Text variant="bodyMedium">No hay reportes abiertos.</Text>
      ) : (
        reportsQuery.data.map((report: OpenReport) => (
          <Card key={report.id} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">{report.listingTitle}</Text>
              <Text variant="bodySmall">Motivo: {report.reason}</Text>
              <Text variant="bodySmall">
                Reportado: {formatDate(report.createdAt)} · miembro {report.reporterId.slice(0, 8)}
              </Text>
              <Text variant="bodySmall">
                Estado de la publicación: {listingStatusLabels[report.listingStatus]}
              </Text>
              <Button
                onPress={() =>
                  router.push({
                    pathname: '/listing/[id]',
                    params: { id: report.listingId },
                  })
                }
              >
                Ver publicación
              </Button>
              <Button
                mode="contained"
                disabled={busyReportId !== null}
                loading={busyReportId === report.id}
                onPress={() => void decideReport(report, 'reviewed', true)}
              >
                Ocultar y revisar
              </Button>
              <View style={styles.actionRow}>
                <Button
                  compact
                  disabled={busyReportId !== null}
                  onPress={() => void decideReport(report, 'reviewed', false)}
                >
                  Revisar sin ocultar
                </Button>
                <Button
                  compact
                  disabled={busyReportId !== null}
                  onPress={() => void decideReport(report, 'dismissed', false)}
                >
                  Descartar
                </Button>
              </View>
            </Card.Content>
          </Card>
        ))
      )}

      <Divider />
      <Text variant="titleLarge">Reportes de tiendas y comentarios</Text>
      {socialReportsQuery.isPending ? (
        <ActivityIndicator />
      ) : socialReportsQuery.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">No se pudieron cargar los reportes sociales.</Text>
          <Button onPress={() => void socialReportsQuery.refetch()}>Reintentar</Button>
        </View>
      ) : socialReportsQuery.data.length === 0 ? (
        <Text variant="bodyMedium">No hay reportes sociales abiertos.</Text>
      ) : (
        socialReportsQuery.data.map((report) => (
          <Card key={report.id} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">
                {report.targetType === 'store'
                  ? 'Tienda'
                  : report.targetType === 'review'
                    ? 'Reseña'
                    : 'Comentario'}
              </Text>
              {report.targetTitle ? <Text variant="bodyMedium">{report.targetTitle}</Text> : null}
              <Text variant="bodySmall">Motivo: {report.reason}</Text>
              <Text variant="bodySmall">Reportado: {formatDate(report.createdAt)}</Text>
              <Button
                mode="contained"
                disabled={busyReportId !== null}
                loading={busyReportId === report.id}
                onPress={() => void decideSocialReport(report, 'reviewed', true)}
              >
                Ocultar y revisar
              </Button>
              <View style={styles.actionRow}>
                <Button
                  compact
                  disabled={busyReportId !== null}
                  onPress={() => void decideSocialReport(report, 'reviewed', false)}
                >
                  Revisar sin ocultar
                </Button>
                <Button
                  compact
                  disabled={busyReportId !== null}
                  onPress={() => void decideSocialReport(report, 'dismissed', false)}
                >
                  Descartar
                </Button>
              </View>
            </Card.Content>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 20,
  },
  cardContent: {
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  state: {
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
});
