import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import {
  Button,
  Card,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { AccountRequiredSheet } from '@/features/auth/AccountRequiredSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';

const commentSchema = z.object({
  id: z.string().uuid(),
  parent_comment_id: z.string().uuid().nullable(),
  body: z.string(),
  author_name: z.string(),
  author_is_seller: z.boolean(),
  can_block: z.boolean(),
  created_at: z.string(),
});

export function ListingComments({
  listingId,
  isOwnListing,
}: {
  listingId: string;
  isOwnListing: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [accountSheet, setAccountSheet] = useState(false);
  const [pendingAction, setPendingAction] = useState<'comment' | 'report' | 'block'>('comment');

  const commentsQuery = useQuery({
    queryKey: ['listing-comments', listingId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc('get_public_listing_comments', {
        target_listing_id: listingId,
        page_size: 50,
      });
      if (error) throw error;
      const parsed = z.array(commentSchema).safeParse(data);
      if (!parsed.success) throw new Error('La respuesta de comentarios no tiene el formato esperado.');
      return parsed.data;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (input: { text: string; parentId: string | null }) => {
      const { error } = await getSupabaseClient().rpc('add_listing_comment', {
        target_listing_id: listingId,
        comment_body: input.text.trim(),
        target_parent_comment_id: input.parentId,
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['listing-comments', listingId] });
      if (variables.parentId) {
        setReplyTo(null);
        setReplyText('');
      } else {
        setCommentText('');
      }
      setErrorMessage(null);
      setMessage(variables.parentId ? 'Tu respuesta fue publicada.' : 'Tu pregunta o comentario fue publicado.');
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo publicar el comentario.');
    },
  });

  function requireAccount(action: 'comment' | 'report' | 'block') {
    if (session?.user.id) return true;
    setPendingAction(action);
    setAccountSheet(true);
    return false;
  }

  function openAuth(destination: '/sign-up' | '/sign-in') {
    setAccountSheet(false);
    router.push({
      pathname: destination,
      params: { returnTo: `/listing/${listingId}?resume=${pendingAction}` },
    });
  }

  async function submitReport() {
    if (!reportId || !session?.user.id) return;
    if (!reportReason.trim()) {
      setErrorMessage('Escribe un motivo de hasta 300 caracteres.');
      return;
    }
    try {
      const { error } = await getSupabaseClient().rpc('create_content_report', {
        target_type: 'comment',
        target_id: reportId,
        report_reason: reportReason.trim(),
      });
      if (error) throw error;
      setReportId(null);
      setReportReason('');
      setMessage('Gracias. El comentario fue reportado.');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo reportar el comentario.');
    }
  }

  async function blockAuthor(commentId: string) {
    if (!requireAccount('block')) return;
    try {
      const { error } = await getSupabaseClient().rpc('set_comment_author_block', {
        target_comment_id: commentId,
        should_block: true,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['listing-comments', listingId] });
      setMessage('Dejaste de ver los comentarios de esta cuenta.');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo bloquear la cuenta.');
    }
  }

  return (
    <View style={styles.container}>
      <Text variant="titleLarge">Preguntas y comentarios</Text>
      {commentsQuery.isPending ? (
        <Text variant="bodyMedium">Cargando comentarios…</Text>
      ) : commentsQuery.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">No se pudieron cargar los comentarios.</Text>
          <Button onPress={() => void commentsQuery.refetch()}>Reintentar</Button>
        </View>
      ) : commentsQuery.data.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Todavía no hay preguntas. Sé la primera persona en consultar.
        </Text>
      ) : (
        commentsQuery.data.map((comment) => (
          <Card
            key={comment.id}
            mode="outlined"
            style={comment.parent_comment_id ? styles.replyCard : undefined}
          >
            <Card.Content style={styles.comment}>
              <Text variant="labelLarge">
                {comment.author_name}{comment.author_is_seller ? ' · Vendedor' : ''}
              </Text>
              <Text variant="bodyMedium">{comment.body}</Text>
              {comment.parent_comment_id === null && isOwnListing ? (
                <Button
                  compact
                  onPress={() => {
                    if (requireAccount('comment')) setReplyTo(comment.id);
                  }}
                >
                  Responder
                </Button>
              ) : null}
              {comment.can_block ? (
                <Button compact onPress={() => void blockAuthor(comment.id)}>
                  Bloquear cuenta
                </Button>
              ) : null}
              {session?.user.id ? (
                <Button
                  compact
                  onPress={() => {
                    setReportId(comment.id);
                    setReportReason('');
                  }}
                >
                  Reportar comentario
                </Button>
              ) : (
                <Button
                  compact
                  onPress={() => {
                    setReportId(comment.id);
                    requireAccount('report');
                  }}
                >
                  Reportar comentario
                </Button>
              )}
              {replyTo === comment.id ? (
                <View style={styles.form}>
                  <TextInput
                    mode="outlined"
                    label="Respuesta del vendedor"
                    value={replyText}
                    onChangeText={setReplyText}
                    maxLength={800}
                    multiline
                  />
                  <Button
                    mode="contained"
                    loading={submitMutation.isPending}
                    disabled={submitMutation.isPending || !replyText.trim()}
                    onPress={() => submitMutation.mutate({ text: replyText, parentId: comment.id })}
                  >
                    Publicar respuesta
                  </Button>
                </View>
              ) : null}
            </Card.Content>
          </Card>
        ))
      )}
      {!isOwnListing ? (
        <View style={styles.form}>
          <TextInput
            mode="outlined"
            label="Escribe una pregunta o comentario"
            value={commentText}
            onChangeText={setCommentText}
            maxLength={800}
            multiline
          />
          <HelperText type="info" visible>
            No incluyas enlaces. Máximo 5 comentarios por hora.
          </HelperText>
          <Button
            mode="contained"
            disabled={submitMutation.isPending || !commentText.trim()}
            loading={submitMutation.isPending}
            onPress={() => {
              if (requireAccount('comment')) submitMutation.mutate({ text: commentText, parentId: null });
            }}
          >
            Publicar comentario
          </Button>
        </View>
      ) : null}
      {message ? <Text style={{ color: theme.colors.primary }}>{message}</Text> : null}
      {errorMessage ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{errorMessage}</Text>
      ) : null}
      <Portal>
        <Dialog
          visible={reportId !== null && Boolean(session?.user.id)}
          onDismiss={() => setReportId(null)}
        >
          <Dialog.Title>Reportar comentario</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Motivo"
              value={reportReason}
              onChangeText={setReportReason}
              maxLength={300}
              multiline
            />
            <HelperText type="info" visible>Máximo 300 caracteres.</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setReportId(null)}>Cancelar</Button>
            <Button onPress={() => void submitReport()}>Enviar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <AccountRequiredSheet
        visible={accountSheet}
        onDismiss={() => setAccountSheet(false)}
        onRegister={() => openAuth('/sign-up')}
        onSignIn={() => openAuth('/sign-in')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingVertical: 12 },
  state: { alignItems: 'center', gap: 8, padding: 12 },
  comment: { gap: 6 },
  replyCard: { marginLeft: 20 },
  form: { gap: 8 },
});
