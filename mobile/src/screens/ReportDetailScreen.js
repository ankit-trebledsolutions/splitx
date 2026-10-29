import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import ImageViewer from '../components/ImageViewer';
import GradientButton from '../components/GradientButton';
import { fetchReport } from '../api/support.api';
import { categoryLabel, statusOf } from '../data/support';
import { absoluteUrl } from '../utils/attachments';
import { formatDateTime } from '../utils/format';
import { radius, spacing, useStyles, useTheme } from '../theme';
import { StatusPill } from './MyReportsScreen';

const TILE = 84;

// A status change, as one quiet line in the updates.
const StatusLine = ({ event }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.statusLine}>
      <Ionicons name="swap-horizontal-outline" size={14} color={theme.textMuted} />
      <Text style={styles.statusLineText}>
        Marked as <Text style={styles.statusLineStrong}>{statusOf(event.status).label}</Text>
      </Text>
      <Text style={styles.statusLineTime}>{formatDateTime(event.createdAt)}</Text>
    </View>
  );
};

// What the team wrote back.
const ReplyCard = ({ event }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.reply}>
      <View style={styles.replyTop}>
        <View style={styles.replyAvatar}>
          <Ionicons name="headset-outline" size={14} color={theme.accentGreen} />
        </View>
        <Text style={styles.replyName}>Splix Support</Text>
        <Text style={styles.replyTime}>{formatDateTime(event.createdAt)}</Text>
      </View>
      <Text style={styles.replyBody}>{event.body}</Text>
    </View>
  );
};

/**
 * One of the person's reports: what they sent, where it stands, and every
 * reply and status change since. Opened from My Reports, or from the
 * notification an admin's reply raises (which brings only the id).
 */
const ReportDetailScreen = ({ route, navigation }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { reportId, report: initial = null } = route.params;
  const [report, setReport] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [gone, setGone] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const fresh = await fetchReport(reportId);
        if (active) setReport(fresh);
      } catch {
        // Nothing to show unless the list handed one over: it may have gone
        // with the account, or the phone may be offline.
        if (active && !initial) setGone(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reportId, initial]);

  const status = report ? statusOf(report.status) : null;
  const events = report?.events ?? [];
  const finished = report && (report.status === 'resolved' || report.status === 'closed');

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={navigation.goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report</Text>
        <View style={styles.headerGhost} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentGreen} />
        </View>
      ) : gone || !report ? (
        <View style={styles.loading}>
          <Text style={styles.goneTitle}>This report could not be opened</Text>
          <Text style={styles.goneText}>It may have been removed, or you may be offline.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Text style={styles.category}>{categoryLabel(report.category)}</Text>
            <StatusPill status={report.status} />
          </View>
          <Text style={styles.subject}>{report.subject}</Text>
          <Text style={styles.sent}>Sent {formatDateTime(report.createdAt)}</Text>

          <View style={styles.card}>
            <Text style={styles.message}>{report.message}</Text>
            {report.attachments?.length > 0 && (
              <View style={styles.tiles}>
                {report.attachments.map((file, index) => (
                  <TouchableOpacity
                    key={file.url}
                    activeOpacity={0.85}
                    onPress={() =>
                      setViewing({
                        uri: absoluteUrl(file.url),
                        title: `Screenshot ${index + 1} of ${report.attachments.length}`,
                      })
                    }
                  >
                    <Image
                      source={{ uri: absoluteUrl(file.thumbUrl || file.url) }}
                      style={styles.tile}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={[styles.hintRow, { borderColor: `${status.tint}55` }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.ink(status.tint)} />
            <Text style={[styles.hintText, { color: theme.ink(status.tint) }]}>{status.hint}</Text>
          </View>

          <Text style={styles.sectionLabel}>Updates</Text>
          {events.length === 0 ? (
            <Text style={styles.noUpdates}>
              No reply yet. We'll let you know here, and with a notification, as soon as
              there is one.
            </Text>
          ) : (
            events.map((event, index) =>
              event.kind === 'reply' ? (
                <ReplyCard key={event._id ?? index} event={event} />
              ) : (
                <StatusLine key={event._id ?? index} event={event} />
              )
            )
          )}

          {finished && (
            <View style={styles.finished}>
              <Text style={styles.finishedText}>
                Still happening, or something new? Send another report and we'll pick it up.
              </Text>
              <GradientButton
                title="Send a new report"
                onPress={() => navigation.navigate('ReportProblem')}
                style={styles.finishedButton}
              />
            </View>
          )}
        </ScrollView>
      )}

      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </DarkScreen>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerGhost: { width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
  },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  goneTitle: { color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  goneText: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xs },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  category: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subject: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: spacing.sm },
  sent: { color: theme.textMuted, fontSize: 12, marginTop: 4, marginBottom: spacing.md },

  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  message: { color: theme.text, fontSize: 14, lineHeight: 21 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2, marginTop: spacing.md },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
  },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  hintText: { flex: 1, fontSize: 13, fontWeight: '600' },

  sectionLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  noUpdates: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },

  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusLineText: { flex: 1, color: theme.textMuted, fontSize: 12 },
  statusLineStrong: { color: theme.text, fontWeight: '700' },
  statusLineTime: { color: theme.textMuted, fontSize: 11 },

  reply: {
    backgroundColor: 'rgba(0,196,208,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.30)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  replyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  replyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,196,208,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyName: { flex: 1, color: theme.text, fontSize: 13, fontWeight: '700' },
  replyTime: { color: theme.textMuted, fontSize: 11 },
  replyBody: { color: theme.text, fontSize: 14, lineHeight: 20 },

  finished: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: spacing.md,
  },
  finishedText: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  finishedButton: { marginTop: spacing.md },
});

export default ReportDetailScreen;
