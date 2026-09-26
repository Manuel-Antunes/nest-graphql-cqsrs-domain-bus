import { WebPage } from './web-page';

/**
 * One of better-auth-ui's views, opened only once it can be typed into. Its forms are TanStack Form
 * state, not the DOM: a field filled before the page hydrates keeps its text on screen and loses it in
 * the form, which then refuses to submit with "This field is required".
 */
export abstract class AuthView extends WebPage {
  override async open(): Promise<void> {
    await super.open({ settle: true });
  }
}
