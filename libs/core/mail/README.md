# mail

Class-based email — one class per kind of email, composing its own message — sent through
[`@nestjs-modules/mailer`](https://nest-modules.github.io/mailer/), with bodies written as
[React Email](https://react.email) templates. The mail classes are a port of `@adonisjs/mail`'s; see
`NOTICE.md` for what came from there.

```tsx
export const WelcomeEmail = defineEmailTemplate(
  'users/welcome',
  ({ name }: { name: string }) => (
    <Html>
      <Text>Welcome, {name}</Text>
    </Html>
  ),
);

export class WelcomeMail extends Mail {
  override subject = 'Welcome';

  constructor(private readonly user: { email: string; name: string }) {
    super();
  }

  prepare() {
    this.message
      .to(this.user.email, this.user.name)
      .htmlView(WelcomeEmail, { name: this.user.name })
      .textView(WelcomeEmail.text, { name: this.user.name });
  }
}

await mailService.sendMail(new WelcomeMail(user));
```

## Wiring

`MailModule` **is** `@nestjs-modules/mailer`'s module, with one difference: its `MailerService` is
`MailService`, which sends a `Mail` as well as the mailer's own options. It takes exactly the mailer's
options — `transport`, `transports`, `defaults`, `template` (`dir`, `adapter`, `resolver`), `plugins`,
`preview`, `i18n` — under the mailer's own `MAILER_OPTIONS`, and chooses none of them. It provides what
`MailerModule` provides — `MailerService`, `MailerBatchService`, `MailerEventService`,
`MailerHealthIndicator` — and binds `MailerService` to the one `MailService`, so injecting either
reaches the same transporters. Import it **instead of** `MailerModule`, never beside it: each would
build transporters of its own. It is global unless `isGlobal: false`.

```ts
MailModule.forRootAsync({
  inject: [mailConfig.KEY],
  useFactory: ({ transport, from }: MailConfig) => ({
    transport,
    defaults: { from },
    template: { resolver: new ReactEmailTemplateResolver() },
    plugins: [plainTextFromHtml()],
  }),
})
```

**The sender is configured in one place: the module's `defaults.from`** (`MAIL_FROM`, in the
notificator). A mail that names no `from` is given it, as it was given, before it is built — as Adonis
gives its message the configured `from` before composing it — so `prepare` can read it: a calendar
invitation names its sender as the organizer. A mail that sets its own `from`, on the class or on the
message, keeps it.

`forRootAsync` is Nest's `ConfigurableModuleBuilder`: `useFactory`, `useExisting`, or `useClass` with
the mailer's `MailerOptionsFactory` (`createMailerOptions`).

```ts
constructor(private readonly mailer: MailService) {}

await this.mailer.sendMail(new WelcomeMail(user));
await this.mailer.sendMail({ to, subject: 'Hi', template: 'users/welcome', context: { name } });
```

What this library offers beside the module is optional, and composes with anything else the mailer
supports:

| | what it does |
|---|---|
| `ReactEmailTemplateResolver` | the mailer's `template.resolver` for React Email, a plain `TemplateResolver`: finds the template by the name `defineEmailTemplate` registered and renders it with the `context` as its props — as HTML, or, for its `<name>.txt`, as plain text |
| `plainTextFromHtml(options?)` | a mailer plugin that writes the plain-text part from the HTML when a message has none — whichever engine produced the HTML. React Email's own selectors, overridable with `html-to-text` options |

A different engine is the mailer's usual configuration, and a mail class names its template by what
that engine knows it as:

```ts
MailModule.forRoot({
  transport,
  template: { dir: join(__dirname, 'templates'), adapter: new HandlebarsAdapter() },
});

this.message.to(user.email).htmlView('welcome', { name: user.name }); // templates/welcome.hbs
```

Which transport, from which environment, is the application's decision — `apps/notificator`'s is
`config/mail.config.ts` (`MAIL_TRANSPORT` = `smtp` | `ses` | `json`), a `registerAs('mail')` the
`MailModule.forRootAsync` injects.

## The bodies: set directly, or rendered from a view

As in Adonis, each body is either set directly or rendered from a view, and the one set directly wins:

| | HTML | plain text |
|---|---|---|
| directly | `message.html(content)` | `message.text(content)` |
| from a view | `message.htmlView(template, data)` | `message.textView(template, data)` |

A view records the template's **name** and its data, and renders nothing — which is what lets a
message be built in one process and rendered in another that knows the same template. A React Email
template is passed as what `defineEmailTemplate` returned, which types its props; any other engine's by
its name.

React Email's **double rendering** is the same component rendered twice, once with `plainText`.
`defineEmailTemplate('users/welcome', …)` registers both: the HTML under `users/welcome`, and the plain
text under `users/welcome.txt` — the extension the mailer gives a `textTemplate` — which is
`WelcomeEmail.text`. `htmlView` takes the one and `textView` the other, and the types refuse them the
other way round. With no text body and no text view, `plainTextFromHtml` converts the HTML instead,
with the same selectors.

## When a view is rendered: at send, or in `prepare`

The mail decides.

**At send**, the default: nothing in this library renders. `MailService` builds the mail and hands it
to the mailer as the mailer's own options — the HTML view as `template`, the text view as
`textTemplate`, and their data, merged, as the one `context` the mailer has — and the mailer renders
them the way it always does:

- `template` through its resolver, or its adapter — Handlebars and every other adapter work here.
- `textTemplate` from a `.txt` under `template.dir`, the mailer's own text fallback; and, what
  `MailService` adds, through the template resolver when there is one and no `text` — the same step,
  with the same guard, as the mailer's `template` → `html`. That is the step a React Email text view
  goes through, and it is the one piece of this library meant to go upstream as it is.

**In `prepare`**, when the mail calls `computeContents(resolver)` with any `TemplateResolver`. Each view
is rendered there and then, with its own data, and the mailer is handed bodies it sends as they are —
it needs no resolver for them at all:

```ts
async prepare() {
  this.message
    .to(this.user.email)
    .htmlView(WelcomeEmail, { name: this.user.name })
    .textView(WelcomeEmail.text, { name: this.user.name });
  await this.message.computeContents(new ReactEmailTemplateResolver());
}
```

A React Email template has to be registered in the process that renders it — its module imported — or
the render fails with `UnknownEmailTemplateException`. Its props must be plain data.

## A calendar event

`message.icalEvent(...)` attaches an iCalendar event as the message's `text/calendar` alternative —
what a mail client turns into *Add to calendar*, or into an invitation to answer. It is Adonis's API
over [`ical-generator`](https://github.com/sebbo2002/ical-generator), and it goes out as nodemailer's
own `icalEvent`:

```ts
this.message.icalEvent(
  (calendar) =>
    calendar.createEvent({
      id: `${event.id}@nestposts`,
      sequence: event.sequence,
      start,
      end,
      summary: event.title,
      organizer: { name, email },
      attendees,
    }),
  { method: 'REQUEST', filename: 'invite.ics' },
);
```

A function is handed a calendar already carrying the method the options name, so the file's `METHOD`
and the MIME part's agree; a string is the `.ics` as it is; `icalEventFromFile` and
`icalEventFromUrl` take it from disk or from a URL nodemailer fetches. An update to an event a
calendar already holds is the same `UID` with a higher `SEQUENCE` — `libs/events`' invitations are the
worked example.

## A template in a library

A `.tsx` file in a library needs `jsx: react-jsx` in that library's `tsconfig.lib.json` and
`tsconfig.spec.json`, and `.tsx` in their `include` — `libs/posts` is the example. Import the mail
class, never the `.tsx`, from outside the library: the `@nestposts/source` export condition maps to
`src/*.ts`.

## Testing

- `mail.buildWithContents(resolver)` builds a mail and renders its views without sending it: the HTML
  and the text are then on `mail.message.toObject().message`.
- `RecordingMailService` (`@nestposts/mail/testing/recording-mail.service`) keeps what it is handed —
  a mail built, its views unrendered — and sends nothing:
  `{ provide: MailService, useValue: new RecordingMailService() }`. `failNext()` makes the next send
  reject.
- `CapturingMailService` is the real `MailService`, keeping what the transport answered. With
  `MAIL_TRANSPORT=json` that answer's `message` is the whole rendered message:
  `.overrideProvider(MailService).useClass(CapturingMailService)` — which also rebinds
  `MailerService`, an alias of it.
- A subclass of `MailService` the container builds declares the mailer's constructor again, decorators
  included, as `CapturingMailService` does: Nest reads `@Optional()` off the class itself, never off its
  parent, and without it the transport factory the mailer may go without becomes required.
