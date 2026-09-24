# microservices-aws

SNS and SQS as a Nest microservice transport — `ClientRMQ`/`ServerRMQ`'s counterparts, and nothing
else. It knows nothing about CQRS, envelopes or `@EventType`: a proxy sends whatever its serializer
answers, and the strategy reads whatever its deserializer answers.

| | |
|---|---|
| `SnsClientProxy` | publishes to a topic; FIFO is inferred from `.fifo` |
| `SqsClientProxy` | sends to one queue; `SqsRecordBuilder` adds a delay or FIFO ids |
| `SqsStrategy` | receives: a long-polling loop when given `queueUrl`, driven by a Lambda otherwise |
| `processSqsEvent` | a Lambda handler's body: one result per record, reported as `batchItemFailures` |
| `SqsContext` | `@Ctx()`: the record, its receive count (`getRetryCount()`, from zero), the Lambda invocation |
| `awsClientConfig`, `queueUrlFromArn`, `localQueueUrl`, `localTopicArn` | the one difference between AWS and LocalStack |
| `topicMatches` | AMQP's reading of a topic pattern, which the strategy applies because a queue has no bindings |

With no serializer and no deserializer, a proxy sends `{ pattern, data }` as the body and the strategy
reads it back with Nest's `IncomingRequestDeserializer`. A serializer may instead answer an
`AwsOutgoingMessage` — a body, the message attributes a subscription filters on, and the FIFO group
and deduplication ids. `@nestposts/transport-eventbus` ships the pair for domain events.

```ts
const client = new SqsClientProxy({ queueUrl });
client.emit('billing.invoice.requested', new SqsRecordBuilder({ invoiceId }).setDelaySeconds(30).build());

app.connectMicroservice({ strategy: new SqsStrategy({ queueUrl }) });

@EventPattern('billing.invoice.*')
requested(@Payload() data: { invoiceId: string }, @Ctx() context: SqsContext) {}
```
