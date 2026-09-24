#!/usr/bin/env node
// Whether the notificator delivered a notification through a channel, read from its own log in
// CloudWatch — the delivery ledger lives in a database behind the VPC, and the line the notificator
// writes after each channel is the same fact, told from outside.
//
// It waits: the notification crosses SNS and SQS first, and the first lap pays a cold start.
//
//   node infra/scripts/notification-delivered.mjs <log group> <notification id> <channel> [seconds]
//   (the log group is what `log-group.mjs` prints — `discover.sh` exports it as NOTIFICATOR_LOGS)
//   # prints the line it found, exits 0; exits 1 when the deadline passes without it
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

const [logGroupName, notificationId, channel, seconds = '180'] =
  process.argv.slice(2);
if (!logGroupName || !notificationId || !channel) {
  console.error(
    'usage: notification-delivered.mjs <log group> <notification id> <channel> [seconds]',
  );
  process.exit(2);
}

const client = new CloudWatchLogsClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});
const startTime = Date.now() - 30 * 60 * 1000;
const deadline = Date.now() + Number(seconds) * 1000;
const wanted = `through "${channel}"`;

// The notificator logs through pino: one JSON record per line, the sentence in `msg`.
const sentenceOf = (message) => {
  try {
    return JSON.parse(message).msg ?? message;
  } catch {
    return message;
  }
};

for (;;) {
  let nextToken;
  do {
    const page = await client.send(
      new FilterLogEventsCommand({
        logGroupName,
        startTime,
        filterPattern: `"${notificationId}"`,
        nextToken,
      }),
    );
    for (const event of page.events ?? []) {
      const sentence = sentenceOf(event.message ?? '');
      if (sentence.includes(notificationId) && sentence.includes(wanted)) {
        console.log(sentence);
        process.exit(0);
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);

  if (Date.now() > deadline) {
    console.error(
      `${logGroupName} never said ${notificationId} went ${wanted} in ${seconds}s`,
    );
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
