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
    this.message.to(this.user.email, this.user.name).view(WelcomeEmail, { name: this.user.name });
  }
}

await mailSender.send(new WelcomeMail(user));
```

## Wiring

`MailModule` takes **exactly `@nestjs-modules/mailer`'s options** — `transport`, `transports`,
`defaults`, `template` (`dir`, `adapter`, `resolver`), `plugins`, `preview` — and passes them to
`MailerModule` untouched. Nothing is chosen for you; what it adds is `MailSender`, the one thing an
application injects to send a `Mail`. It is global unless `isGlobal: false`.

```ts
MailModule.forRootAsync({
  useFactory: () => ({
    transport: 'smtp://localhost:1025',
    defaults: { from: 'Nest Posts <no-reply@nestposts.local>' },
    template: { resolver: new ReactEmailTemplateResolver() },
    plugins: [plainTextFromHtml()],
  }),
})
```

What this library offers beside the module is optional, and composes with anything else the mailer
supports:

| | what it does |
|---|---|
| `ReactEmailTemplateResolver` | the mailer's `template.resolver` for React Email: finds the template by the name `defineEmailTemplate` registered and renders it with the `context` as its props |
| `plainTextFromHtml(options?)` | a mailer plugin that writes the plain-text part from the HTML when a message has none — whichever engine produced the HTML. React Email's own selectors, overridable with `html-to-text` options |

A different engine is the mailer's usual configuration, and a mail class names its template by what
that engine knows it as:

```ts
MailModule.forRoot({
  transport,
  template: { dir: join(__dirname, 'templates'), adapter: new HandlebarsAdapter() },
});

this.message.to(user.email).view('welcome', { name: user.name }); // templates/welcome.hbs
```

Which transport, from which environment, is the application's decision — `apps/notificator`'s is
`config/mail.config.ts` (`MAIL_TRANSPORT` = `smtp` | `ses` | `json`), a `registerAs('mail')` the
`MailModule.forRootAsync` injects.

## How a view becomes HTML

`message.view(template, context)` records the template's **name** and its context, and nothing is
rendered until the mail is sent — which is what lets a message be built in one process and rendered in
another that knows the same template. `NestMailerSender` hands the mailer `template` and `context`,
and the mailer renders them: through its resolver when one is configured and there is no `html`, or
through its adapter. A message with explicit `html` skips all of it.

A React Email template has to be registered in the process that sends — its module imported — or the
send fails with `UnknownEmailTemplateException`. Its props must be plain data.

## A template in a library

A `.tsx` file in a library needs `jsx: react-jsx` in that library's `tsconfig.lib.json` and
`tsconfig.spec.json`, and `.tsx` in their `include` — `libs/posts` is the example. Import the mail
class, never the `.tsx`, from outside the library: the `@nestposts/source` export condition maps to
`src/*.ts`.

## Testing

- `RecordingMailSender` (`@nestposts/mail/testing/recording-mail-sender`) keeps what it is handed,
  built, and sends nothing. `failNext()` makes the next send reject.
- `CapturingMailSender` sends through the real mailer and keeps what the transport answered. With
  `MAIL_TRANSPORT=json` that is the whole rendered message:
  `.overrideProvider(MailSender).useFactory(capturingMailSender)`.
