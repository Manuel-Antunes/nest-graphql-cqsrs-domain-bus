# mail

The class-based mail of this library is a port of [**@adonisjs/mail**](https://github.com/adonisjs/mail)
by AdonisJS, MIT licensed (see `LICENSE`). A copy of that package was vendored into the repository as
the reference, and what is here was taken from it and reshaped; the copy itself is gone.

## What came from upstream

| here | upstream | what changed |
|---|---|---|
| `Mail` | `BaseMail` (`base_mail.ts`) | `subject`, `from`, `replyTo`, `message`, `prepare()`, `build()` and `buildWithContents()` as they were, `build()` returning the message. `send` and `sendLater` are gone: a mail no longer sends itself, `MailService` does |
| `Message` | `Message` (`message.ts`) | the fluent builder — recipients, subject, bodies, attachments, embeds, headers, the `has*` inspectors — minus `Macroable`, list headers and the `assert*` helpers, which depended on `@adonisjs/core` |
| `Message.icalEvent` / `icalEventFromFile` / `icalEventFromUrl` | the same three, over `ical-generator` | as upstream, `CalendarEventMethod` and `CalendarEventOptions` included; the calendar a function is handed is created with the method the options name, so the `.ics` and its MIME part cannot disagree — upstream left that to the function |
| `Message.htmlView` / `textView` | `htmlView(template, data)` / `textView(template, data)` | a React Email template is carried by its registered **name**, so a built message is plain data another process can render. A React Email text view is the template's `text`, the same component registered under `<name>.txt` and rendered with `plainText` |
| `Message.computeContents(resolver)` | `computeContents()` | renders through the `TemplateResolver` it is handed — the mailer's contract — where upstream rendered through the static `Message.templateEngine`. A body set directly wins over its view, as upstream |
| `CompiledMessage` (`toObject()`) | `{ message, views }` | `views` holds `html` and `text`; `watch` is not ported |
| `MailService.sendMail(mail)` | `Mailer.send(mail)` → `sendCompiled` | the mailer is `@nestjs-modules/mailer`'s `MailerService`, extended. What upstream rendered in `sendCompiled` is left to the mailer: the views become its `template` and `textTemplate`, their data its one `context`. The one step added to it resolves a `textTemplate` through the template resolver, as it resolves a `template`. A mail with no `from` is given the mailer's `defaults.from` before it is built, as upstream's `Mailer.send` gives a composed message the configured `from` first |

## What upstream had and this does not

`MailManager`, `Mailer`, the transports (SMTP, SES, Mailgun, SparkPost, Resend, Brevo, Postmark,
Cloudflare), the in-memory messenger, `sendLater`, the callback form of `send`, `defineConfig` and the
fake mailer. Transports, module wiring and the HTML template step are
[`@nestjs-modules/mailer`](https://nest-modules.github.io/mailer/)'s here: `MailModule` provides the
mailer's own services under its own `MAILER_OPTIONS`, with `MailService` as its `MailerService`, and
`ReactEmailTemplateResolver` is offered as its `template.resolver` — any adapter the mailer supports
works instead. The fake mailer's job is done by `RecordingMailService` and
`CapturingMailService`.
