# mail

The class-based mail of this library is a port of [**@adonisjs/mail**](https://github.com/adonisjs/mail)
by AdonisJS, MIT licensed (see `LICENSE`). A copy of that package was vendored into the repository as
the reference, and what is here was taken from it and reshaped; the copy itself is gone.

## What came from upstream

| here | upstream | what changed |
|---|---|---|
| `Mail` | `BaseMail` (`base_mail.ts`) | `subject`, `from`, `replyTo`, `message`, `prepare()`, `build()` as they were. `send` and `sendLater` are gone: a mail no longer sends itself, a `MailSender` does |
| `Message` | `Message` (`message.ts`) | the fluent builder — recipients, subject, bodies, attachments, embeds, headers, the `has*` inspectors — minus `Macroable`, iCal events, list headers and the `assert*` helpers, which depended on `@adonisjs/core` |
| `Message.view(template, props)` | `htmlView(template, data)` | the view is a React Email template carried by its registered **name**, so a built message is plain data another process can render |
| `CompiledMessage` (`toObject()`) | `{ message, views }` | one view instead of three (`html`, `text`, `watch`): React Email renders the text from the same template |

## What upstream had and this does not

`MailManager`, `Mailer`, the transports (SMTP, SES, Mailgun, SparkPost, Resend, Brevo, Postmark,
Cloudflare), the in-memory messenger, `defineConfig` and the fake mailer. Transports, module wiring
and the template step are [`@nestjs-modules/mailer`](https://nest-modules.github.io/mailer/)'s here:
`MailModule` passes the mailer's own options to its module, `NestMailerSender` calls its `sendMail`,
and `ReactEmailTemplateResolver` is offered as its `template.resolver` — any adapter the mailer
supports works instead. The fake mailer's job is done by `RecordingMailSender` and
`CapturingMailSender`.
